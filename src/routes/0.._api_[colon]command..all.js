import fs from 'fs'
import path from 'path'
import util from 'util'
import bunyan from 'bunyan'
import uuidv1 from 'uuid/v1'
import { PicturesToFont, Potrace } from 'picfont'
import Aws from '../libs/Aws'
import ImageHelpers from '../libs/ImageHelpers'
import config from '../config'

const log = bunyan.createLogger(config.logger.options)
const deleteFile = util.promisify(fs.unlink)

export default async function Api(req, res) {
  const command = req.params.command
  const info = req.body

  const imageHelpers  = new ImageHelpers()
  const s3            = Aws().S3

  let fileInfo, fileName, filePath, fileType
  if (info.file) {
    fileInfo = info.file
    fileName = fileInfo.name
    filePath = fileInfo.path
    fileType = fileInfo.type
  }

  switch(command) {
    case 'upload':
      try {
        if (!filePath)
          return res.status(400).json({ error: `We didn't find a file to upload. Please make sure to include one next time.` })

        const { lwipImg }     = await imageHelpers.rotateImagePerExifOrientation('fs', filePath)
        const newImageBuffer  = await imageHelpers.toBuffer(lwipImg, ImageHelpers.getImageTypeFromFile(fileName))
        const mainS3FileName  = await s3.writeFile({ filename: fileName, data: newImageBuffer })

        await deleteFile(filePath)
        res.json({ filename: mainS3FileName.filename })

      } catch(err) {
        log.error(err)
        return res.status(500).json({ error:`There was an issue uploading the file: ${fileName}` })
      }
      break

    case 'create_font':
      try {
        const pictures  = info.pictures
        const myUuid    = uuidv1()
        const pictureBuffers = await Promise.all(
          pictures.map(async picture => (await s3.getFile({ filename: picture })).Body)
        )

        const fontFileData = await PicturesToFont(pictureBuffers, {
          types: [ 'woff2', 'woff', 'eot', 'svg', 'ttf' ],
          fontName: `iconfont_${myUuid}`,
          cssTemplate: `./templates/css.hbs`,
          htmlTemplate: `./templates/html.hbs`
        })

        const uploadedFontFileData = await Promise.all(
          Object.keys(fontFileData).map(async key => {
            if (fontFileData[key] instanceof Buffer) {
              const newFileName = Potrace.getFileName(`iconfont.${key}`, myUuid)
              await s3.writeFile({ filename: newFileName, data: fontFileData[key], exact_filename: true })
              return { [key]: newFileName}
            }
            return null
          })
        )
        let newUrls = {}
        uploadedFontFileData.filter(o => !!o).forEach(obj => {
          const type = Object.keys(obj)[0]
          newUrls[type] = `${config.server.HOST}/file/s3/${obj[type]}`
        })

        const newScss = fontFileData.generateCss(newUrls)
        const newHtml = fontFileData.generateHtml()
        const [ uploadedScss, uploadedHtml ] = await Promise.all([
          s3.writeFile({ filename: 'new.css', data: newScss }),
          s3.writeFile({ filename: 'new.html', data: newHtml })
        ])

        res.json({ css: uploadedScss.filename, html: uploadedHtml.filename })

      } catch(err) {
        log.error(err)
        return res.status(500).json({ error:`There was an issue creating your font.` })
      }
      break

    default:
      const error = { error: 'Cannot understand you.' }
      res.status(404).json(error)
      log.error(error)
  }
}
