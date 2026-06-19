import { prisma } from "./lib/db"

export async function checkDb() {
  // const client = new PrismaClient()
  
  try {
    await prisma.$queryRaw`SELECT 1`
    console.log("DB is Alive")
  } catch {
    console.warn("Could not connect to DB Exiting")
    process.exit(1)
  } finally {
    await prisma.$disconnect
  }
  console.log('Server started')
}