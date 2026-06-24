export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const mode = (process.env.NEXT_PUBLIC_DATABASE_MODE || 'local').replace(/^["']|["']$/g, '');
    if (mode === 'local') {
      console.log('Local mode — skipping database connection');
    } else if (mode === 'dev') {
      process.env.DATABASE_URL = process.env.DATABASE_URL_DEV;
      console.log("running db as dev")
      const { checkDb } = await import('./instrumentation.node');
      await checkDb();
    } else if (mode === 'prod') {
      console.log("running db as prod")
      process.env.DATABASE_URL = process.env.DATABASE_URL_PROD;
      const { checkDb } = await import('./instrumentation.node');
      await checkDb();
    } else {
      console.warn(`Invalid NEXT_PUBLIC_DATABASE_MODE: "${mode}". Must be "local", "dev", or "prod".`);
      const { quit } = await import('./instrumentation.node');
      quit();
      return;
    }
  }

  console.log('Server started');
}
