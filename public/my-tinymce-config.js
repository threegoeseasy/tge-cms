tinymce.init({
  selector: "textarea#my-expressjs-tinymce-app",
  plugins: "lists link image table code help wordcount",
  images_upload_url: "/saveImage",
  license_key: "gpl",
  relative_urls: false,
  remove_script_host: false,
  convert_urls: true,
  // document_base_url: "http://localhost:3333/uploads_blog/",
  document_base_url: "https://luckycms.threegoeseasy.ru/uploads_blog/",
});
