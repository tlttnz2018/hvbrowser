const encoding = require('encoding-japanese');
const iconv = require('iconv-lite');
const Buffer = require('buffer').Buffer;

const utf8ArrayToStr = (function () {
    var charCache = new Array(128);  // Preallocate the cache for the common single byte chars
    var charFromCodePt = String.fromCodePoint || String.fromCharCode;
    var result = [];

    return function (array) {
        var codePt, byte1;
        var buffLen = array.length;

        result.length = 0;

        for (var i = 0; i < buffLen;) {
            byte1 = array[i++];

            if (byte1 <= 0x7F) {
                codePt = byte1;
            } else if (byte1 <= 0xDF) {
                codePt = ((byte1 & 0x1F) << 6) | (array[i++] & 0x3F);
            } else if (byte1 <= 0xEF) {
                codePt = ((byte1 & 0x0F) << 12) | ((array[i++] & 0x3F) << 6) | (array[i++] & 0x3F);
            } else if (String.fromCodePoint) {
                codePt = ((byte1 & 0x07) << 18) | ((array[i++] & 0x3F) << 12) | ((array[i++] & 0x3F) << 6) | (array[i++] & 0x3F);
            } else {
                codePt = 63;    // Cannot convert four byte code points, so use "?" instead
                i += 3;
            }

            result.push(charCache[codePt] || (charCache[codePt] = charFromCodePt(codePt)));
        }

        return result.join('');
    };
})();

function get(url) {
    // Return a new promise.
    return new Promise(function(resolve, reject) {
        // Do the usual XHR stuff
        var req = new XMLHttpRequest();
        req.open('GET', url, true);
        req.responseType = "arraybuffer";

        req.onload = function() {
        // This is called even on 404 etc
        // so check the status
            if (req.status == 200) {
                // Resolve the promise with the response text
                var arrayBuffer = req.response;

                if (arrayBuffer) {
                    var byteArray = new Uint8Array(arrayBuffer);
                    var detected = encoding.detect(byteArray);
                    if(detected === 'UTF8') {
                        resolve(utf8ArrayToStr(byteArray));
                    } else { // Maybe GBK
                        resolve(iconv.decode(new Buffer(byteArray), 'gbk'));
                    }
                } else {
                    resolve("");
                }
            }
            else {
                // Otherwise reject with the status text
                // which will hopefully be a meaningful error
                reject(Error(req.statusText));
            }
        };

        // Handle network errors
        req.onerror = function() {
            reject(Error("Network Error"));
        };

        // Make the request
        req.send();
    });
}

export const downloadHtmlPage = async url => {
    console.log("Download from: " + url);

    const htmlContent = await get(
        url,
    );
    // console.log(" Downloaded: " + htmlContent);
    return htmlContent;
};

export const convertHtmlPageToHV = async (htmlContent, dictionary) => {
    // Should clean up before convert
    let idx = 0;
    let ch, strUni, hvWord, hvTexts;
    const converts = [];

    // console.log("Convert to HV for: " + htmlContent);

    for(idx = 0; idx < htmlContent.length; idx++) {
        ch = htmlContent[idx];
        hvWord = dictionary[ch];
        if(!!hvWord) {
            hvWord = hvWord + " ";
        } else {
            hvWord = ch;
        }
        converts.push(hvWord);
    }

    hvTexts = converts.join("");
    return hvTexts;
};
