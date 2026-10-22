let app = null;

async function init() {
  if (!app) {
    const { default: mongoose } = await import('mongoose');
    let createApp, connectDb;
    try {
      ({ createApp } = await import('../apps/api/dist/app.js'));
      ({ connectDb } = await import('../apps/api/dist/config/db.js'));
    } catch {
      ({ createApp } = await import('../apps/api/src/app.js'));
      ({ connectDb } = await import('../apps/api/src/config/db.js'));
    }

    if (mongoose.connection.readyState === 0) {
      await connectDb();
    }
    app = createApp();
  }
  return app;
}

export default async function handler(req, res) {
  const expressApp = await init();
  return expressApp(req, res);
}
