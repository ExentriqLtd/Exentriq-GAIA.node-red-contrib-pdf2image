var http = require("follow-redirects").http;
var https = require("follow-redirects").https;
var urllib = require("url");    
var fs = require("fs-extra");

var Promise = require("es6-promise").Promise;

var path = require("path");
var fs   = require("fs");
var util = require("util");
var exec = require("child_process").exec;

var PDFImage = (function() {
	
	let _name = 'PDFImage';
	var node = null;
	
	var that = this;
	
	function PDFImage(pdfFilePath, options, nodeOrigin) {
	  if (!options) options = {};
	  
	  node = nodeOrigin;
	  
	  node.warn("new init 2");
	
	  that.pdfFilePath = pdfFilePath;
	
	  that.setPdfFileBaseName(options.pdfFileBaseName);
	  that.setConvertOptions(options.convertOptions);
	  that.setConvertExtension(options.convertExtension);
	  that.useGM = options.graphicsMagick || false;
	  that.combinedImage = options.combinedImage || false;
	
	  that.outputDirectory = options.outputDirectory || path.dirname(pdfFilePath);
	  
	  node.warn("end init 2");
	  
	  return that;
 }

  that.constructGetInfoCommand= function() {
    return util.format(
      "pdfinfo \"%s\"",
      this.pdfFilePath
    );
  },
  that.parseGetInfoCommandOutput= function(output) {
    var info = {};
    output.split("\n").forEach(function(line) {
      if (line.match(/^(.*?):[ \t]*(.*)$/)) {
        info[RegExp.$1] = RegExp.$2;
      }
    });
    return info;
  },
  that.getInfo= function() {
    var self = this;
    var getInfoCommand = this.constructGetInfoCommand();
    var promise = new Promise(function(resolve, reject) {
      exec(getInfoCommand, function(err, stdout, stderr) {
        if (err) {
          return reject({
            message: "Failed to get PDF'S information",
            error: err,
            stdout: stdout,
            stderr: stderr
          });
        }
        return resolve(self.parseGetInfoCommandOutput(stdout));
      });
    });
    return promise;
  },
  that.numberOfPages= function() {
    return this.getInfo().then(function(info) {
      return info["Pages"];
    });
  },
  that.getOutputImagePathForPage= function(pageNumber) {
    return path.join(
      this.outputDirectory,
      this.pdfFileBaseName + "-" + pageNumber + "." + this.convertExtension
    );
  },
  that.getOutputImagePathForFile= function() {
    return path.join(
      this.outputDirectory,
      this.pdfFileBaseName + "." + this.convertExtension
    );
  },
  that.setConvertOptions= function(convertOptions) {
    this.convertOptions = convertOptions || {};
  },
  that.setPdfFileBaseName= function(pdfFileBaseName) {
    this.pdfFileBaseName = pdfFileBaseName || path.basename(this.pdfFilePath, ".pdf");
  },
  that.setConvertExtension= function(convertExtension) {
    this.convertExtension = convertExtension || "png";
  },
  that.constructConvertCommandForPage= function(pageNumber) {
    var pdfFilePath = this.pdfFilePath;
    var outputImagePath = this.getOutputImagePathForPage(pageNumber);
    var convertOptionsString = this.constructConvertOptions();
    var c = util.format(
      "%s %s\"%s[%d]\" \"%s\"",
      this.useGM ? "gm convert" : "convert",
      convertOptionsString ? convertOptionsString + " " : "",
      pdfFilePath, pageNumber, outputImagePath
    );
     node.warn("convert command " + c);
    return c;
  },
  that.constructCombineCommandForFile= function(imagePaths) {
    var c =  util.format(
      "%s -append %s \"%s\"",
      this.useGM ? "gm convert" : "convert",
      imagePaths.join(' '),
      this.getOutputImagePathForFile()
    );
     node.warn("convert command " + c);
    return c;
  },
  that.constructConvertOptions= function() {
    return Object.keys(this.convertOptions).sort().map(function(optionName) {
      if (this.convertOptions[optionName] !== null) {
        return optionName + " " + this.convertOptions[optionName];
      } else {
        return optionName;
      }
    }, this).join(" ");
  },
  that.combineImages= function(imagePaths) {
    var pdfImage = this;
    var combineCommand = pdfImage.constructCombineCommandForFile(imagePaths);
    return new Promise(function(resolve, reject) {
      exec(combineCommand, function(err, stdout, stderr) {
        if (err) {
          return reject({
            message: "Failed to combine images",
            error: err,
            stdout: stdout,
            stderr: stderr
          });
        }
        exec("rm "+imagePaths.join(' ')); //cleanUp
        return resolve(pdfImage.getOutputImagePathForFile());
      });
    });
  },
  that.convertFile= function() {
    var pdfImage = this;
    return new Promise(function(resolve, reject) {
      pdfImage.numberOfPages().then(function(totalPages) {
        var convertPromise = new Promise(function(resolve, reject){
          var imagePaths = [];
          for (var i = 0; i < totalPages; i++) {
            pdfImage.convertPage(i).then(function(imagePath){
              imagePaths.push(imagePath);
              if (imagePaths.length === parseInt(totalPages)){
                imagePaths.sort(); //because of asyc pages we have to reSort pages
                resolve(imagePaths);
              }
            }).catch(function(error){
              reject(error);
            });
          }
        });

        convertPromise.then(function(imagePaths){
          if (pdfImage.combinedImage){
            pdfImage.combineImages(imagePaths).then(function(imagePath){
              resolve(imagePath);
            });
          } else {
            resolve(imagePaths);
          }
        }).catch(function(error){
          reject(error);
        });
      });
    });
  },
  that.convertPage= function(pageNumber) {
    var pdfFilePath     = this.pdfFilePath;
    var outputImagePath = this.getOutputImagePathForPage(pageNumber);
    var convertCommand  = this.constructConvertCommandForPage(pageNumber);

    var promise = new Promise(function(resolve, reject) {
      function convertPageToImage() {
        exec(convertCommand, function(err, stdout, stderr) {
          if (err) {
            return reject({
              message: "Failed to convert page to image",
              error: err,
              stdout: stdout,
              stderr: stderr
            });
          }
          return resolve(outputImagePath);
        });
      }

      fs.stat(outputImagePath, function(err, imageFileStat) {
        var imageNotExists = err && err.code === "ENOENT";
        if (!imageNotExists && err) {
          return reject({
            message: "Failed to stat image file",
            error: err
          });
        }

        // convert when (1) image doesn't exits or (2) image exists
        // but its timestamp is older than pdf's one

        if (imageNotExists) {
          // (1)
          convertPageToImage();
          return;
        }

        // image exist. check timestamp.
        fs.stat(pdfFilePath, function(err, pdfFileStat) {
          if (err) {
            return reject({
              message: "Failed to stat PDF file",
              error: err
            });
          }

          if (imageFileStat.mtime < pdfFileStat.mtime) {
            // (2)
            convertPageToImage();
            return;
          }

          return resolve(outputImagePath);
        });
      });
    });
    return promise;
  }
  
  
  return PDFImage;
  
})();


module.exports = function(RED) {
    function pdf2image(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        this.reqTimeout = 120000;
        
        
        
        node.on('input', function(msg) {
	        var url = msg.url;
            var filename = msg.filename;
            
            var appConvertOptions = {
						    "-quality": "100",
						  }
            
            if(msg.convertOptions){
	            appConvertOptions = msg.convertOptions;
            }
            
            node.warn("appConvertOptions " , appConvertOptions);
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
                    	
                    	//PDFImage = require("./pdf-image-custom").PDFImage;
			            var pdfImage = new PDFImage(filename + ".pdf", {
				          appConvertOptions,
						  convertExtension: "jpg"
						}, node);
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