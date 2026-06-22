import { prisma } from "./lib/db"


export function quit() {
  process.exit(1)
}
export async function checkDb() {
  // const client = new PrismaClient()
  
  try {
    await prisma.$queryRaw`SELECT 1`
    console.log("DB is Alive")
  } catch {
    console.warn("Could not connect to DB Exiting")
    quit()
  } finally {
    await prisma.$disconnect
  }
}