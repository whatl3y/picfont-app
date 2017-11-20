import util from 'util'
import fs from 'fs'

const readdir = util.promisify(fs.readdir)

export default {
  async get() {
    const files = await readdir('routes')
    const routes = files.map(file => {
      const routeInfo = file.replace(/\.js/g,"").replace(/_/g,"/").replace(/\[star\]/g,"*").replace(/\[colon\]/g,":").split("..")
      const routeOrder = Number(routeInfo[0] || 0)
      const routePath = routeInfo[1]
      const routeVerb = routeInfo[2] || 'get'

      return {
        verb: routeVerb,
        path: routePath,
        order: routeOrder,
        file: file
      }
    })

    return routes.sort((r1, r2) => r1.order - r2.order)
  }
}
