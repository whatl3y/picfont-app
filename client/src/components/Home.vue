<template lang="pug">
  div.text-center
    div#upload-images-wrapper.d-flex.flex-column.align-items-stretch
      h1 picfont in action
      div(v-if="isLoading")
        loader
      div.d-flex.flex-column.justify-content-center.align-items-center(v-if="!isLoading")
        div#upload-images.margin-large
          input#file-uploader(type="file",multiple="true",@change="addImages($event)")
          button.btn.btn-sm.btn-primary(onclick="document.getElementById('file-uploader').click()") Upload Image
          div
            i {{ images.length }} images uploaded
          div.margin-top-large(v-if="images.length > 0")
            button.btn.btn-lg.btn-success(@click="createFont") Create Your Font Now!
        div.container
          div.images-wrapper.row
            div.padding-small.col-xs-6.col-sm-3.col-md-2(v-for="image in images")
              div.d-flex.flex-column.justify-content-center.align-items-center
                img.img-fluid.img-thumbnail(:src="image")
</template>

<script>
  import moment from 'moment'
  import ImageHelpers from '../factories/ImageHelpers'
  import Api from '../factories/Api'

  export default {
    data() {
      return {
        isLoading: false,
        newHtml: null,
        newCss: null,
        images: [],
        finalImages: []
      }
    },

    methods: {
      createFileReader: ImageHelpers.createFileReader,

      async addImages(event) {
        this.isLoading = true
        this.images = []
        SimpleFileUploader.addFiles(event.target.files)
        document.getElementById('file-uploader').value = null

        await Promise.all(
          SimpleFileUploader.getFiles().map(file => {
            return new Promise(_resolve => {
              const fr = this.createFileReader((filereader, result) => {
                this.images.push(result)
                _resolve()
              })
              fr.readAsDataURL(file)
            })
          })
        )

        this.isLoading = false
      },

      uploadImages() {
        return new Promise((resolve, reject) => {
          SimpleFileUploader.startUpload({
            url: `/api/upload`,
            concurrency: 2,
            onCompleted: (file, responseText, status) => {
              if (status >= 400)
                return reject(responseText)

              this.finalImages.push(JSON.parse(responseText).filename)
            },
            onCompletedAll: resolve
          })
        })
      },

      async createFont() {
        try {
          this.isLoading = true

          await this.uploadImages()
          const newFontInfo = await Api.createFont(this.finalImages)
          this.newHtml = `${location.protocol}//${location.hostname}:${location.port}/file/s3/${newFontInfo.html}`
          this.newCss = `${location.protocol}//${location.hostname}:${location.port}/file/s3/${newFontInfo.css}`
          window.open(this.newHtml)

          this.isLoading = false

        } catch(err) {
          console.log("ERROR", err)
        }
      }
    }
  }
</script>
