import bunyan from 'bunyan'
import PostgresClient from '../libs/PostgresClient'
import config from '../config'

const log = bunyan.createLogger(config.logger.options)
const postgres_url = process.env.DATABASE_URL || 'postgres://localhost:5432/picfont'

const postgres = new PostgresClient(postgres_url, { max: 1 })

;(async () => {
  try {
    await Promise.all([
      createFonts(postgres)
    ])

    log.info("Successfully ran DB migrations!")
    process.exit()

  } catch(err) {
    log.error("Error running DB migrations", err)
    process.exit()
  }
})()

async function createFonts(postgres) {
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS fonts (
      id serial PRIMARY KEY,
      name varchar(255),
      created_at timestamp(6) without time zone NOT NULL DEFAULT now(),
      updated_at timestamp(6) without time zone NOT NULL DEFAULT now()
    );
  `)
}
