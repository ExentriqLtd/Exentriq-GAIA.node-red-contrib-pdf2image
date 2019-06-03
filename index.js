module.exports = function(RED) {
    function pdf2image(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.on('input', function(msg) {
            //msg.payload = msg.payload.toLowerCase();
            PDFImage = require("pdf-image");
            var pdfImage = new PDFImage(msg.inputFilePath);
			pdfImage.convertPage(0).then(function (imagePath) {
			  msg.resultPath = imagePath;
			  node.send(msg);
			});
            
            
        });
    }
    RED.nodes.registerType("pdf2image",pdf2image);
}