var http = require("follow-redirects").http;
var https = require("follow-redirects").https;
var urllib = require("url");    
var fs = require("fs-extra");
    
module.exports = function(RED) {
    function pdf2image(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        this.reqTimeout = 120000;
        
        node.on('input', function(msg) {
            var url = msg.url;
            var filename = msg.filename;
            var opts = urllib.parse(url);
            node.warn("http "  + opts.path);
            opts.method = "GET";
            opts.headers = {};
            
            node.warn("get " + url);
            node.warn("http " +  opts);
            
            var req = ((/^https/.test(url))?https:http).request(opts,function(res) {
	            
	            node.warn("res " + res);
	            
                res.setEncoding('binary');
                msg.statusCode = res.statusCode;
                msg.headers = res.headers;
                msg.payload = "";
                // msg.url = url;   // revert when warning above finally removed
                res.on('data',function(chunk) {
                    msg.payload += chunk;
                });
                res.on('end',function() {
	                node.warn("write " + filename);
                    var data = new Buffer(msg.payload,"binary");
                    
                    try{
                    
                    fs.writeFile(filename + ".pdf", data, "binary", function (err) {
                    	if(err)
                    		node.warn(err);
                    	
                    	node.warn("convert " + filename);
                    	
                    	PDFImage = require("pdf-image").PDFImage;
			            var pdfImage = new PDFImage(filename + ".pdf", {convertOptions: {
						    "-quality": "100"
						  }
						});
						pdfImage.convertPage(0).then(function (imagePath) {
						  msg.resultPath = imagePath;
						  node.send(msg);
						});
                    	
                    });
                    
                    }catch(e){
	                    node.warn(e)
                    }
                    
                    //node.send(msg);
                    node.status({});
                });
            });
            
            
            req.setTimeout(node.reqTimeout, function() {
                node.error(RED._("common.notification.errors.no-response"),msg);
                setTimeout(function() {
                    node.status({fill:"red",shape:"ring",text:"common.notification.errors.no-response"});
                },10);
                req.abort();
            });
            req.on('error',function(err) {
                node.error(err,msg);
                msg.payload = err.toString() + " : " + url;
                msg.statusCode = err.code;
                node.send(msg);
                node.status({fill:"red",shape:"ring",text:err.code});
            });
           
             req.end();
            
            
        });
    }
    RED.nodes.registerType("pdf2image",pdf2image);
}