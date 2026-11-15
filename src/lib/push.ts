import { supabase } from "./supabase";

const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function pushSupported() { return supported; }

export async function getPushState(): Promise<"unsupported" | "enabled" | "disabled" | "default"> {
  if (!supported) return "unsupported";
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) return "enabled";
  return Notification.permission === "denied" ? "disabled" : Notification.permission === "granted" ? "default" : "default";
}

export async function subscribeToPush(): Promise<void> {
  if (!supported) throw new Error("Browser ini belum mendukung Web Push.");
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
  if (!publicKey) throw new Error("VITE_VAPID_PUBLIC_KEY belum dikonfigurasi.");
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error("Izin notifikasi tidak diberikan.");
  const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(publicKey),
  });
  const { error } = await supabase.functions.invoke("push-subscribe", { body: { action: "subscribe", subscription: subscription.toJSON() } });
  if (error) {
    await subscription.unsubscribe().catch(() => false);
    throw new Error(error.message || "Gagal menyimpan subscription.");
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  const { error } = await supabase.functions.invoke("push-subscribe", { body: { action: "unsubscribe", endpoint } });
  if (error) throw new Error(error.message || "Gagal menghapus subscription dari server.");
  await subscription.unsubscribe();
}
