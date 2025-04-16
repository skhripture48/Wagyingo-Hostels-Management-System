const webpush = require('web-push');

// VAPID keys
const vapidKeys = {
    publicKey: 'BPH_bYeETv82wTTnOSsBJ69_rxSELuBq_i8vVvIumpnYR0KTRVOeuAjg6riPtU299SBTy5BE2TYkQ1gMNb7x_hM',
    privateKey: 'x_WrmsYiaAv7uTfwqTDE1orCe9StBJ1zxakGgYE96kE'
};

webpush.setVapidDetails(
    'mailto:admin@wagyingo.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

module.exports = webpush; 