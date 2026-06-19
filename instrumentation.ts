export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkDb } = await import('./instrumentation.node')
    await checkDb()
  }

  console.log('Server started')
}