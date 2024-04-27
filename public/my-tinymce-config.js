tinymce.init({
  selector: "textarea#my-expressjs-tinymce-app",
  plugins: "lists link image table code help wordcount",
  images_upload_url: "/saveImage",
  license_key: "gpl",
});
