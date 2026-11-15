import * as webpush from "jsr:@negrel/webpush@0.5.0";

// Run once only. Keep the generated private JWK secret; never commit the output.
const keyPair = await webpush.generateVapidKeys({ extractable: true });
const keys = await webpush.exportVapidKeys(keyPair);
const publicKey = await webpush.exportApplicationServerKey(keyPair);
console.log(JSON.stringify({ keys, publicKey }, null, 2));
