var cheerio = require('cheerio')
var path = require('path')
var Stream = require('stream')
var fancyLog = require('fancy-log')
var PluginError = require('plugin-error')
var Vinyl = require('vinyl')

module.exports = function (config) {

	config = config || {}

	var namespaces = {}
	var isEmpty = true
	var fileName
	var inlineSvg = config.inlineSvg || false
	var convertFont = config.fromSvgFont || false
	var ids = {}

	var resultSvg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs/></svg>'
	if (!inlineSvg) {
		resultSvg =
			'<?xml version="1.0" encoding="UTF-8"?>' +
			'<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" ' +
			'"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' +
			resultSvg
	}

	var $ = cheerio.load(resultSvg, { xmlMode: true })
	var $combinedSvg = $('svg')
	var $combinedDefs = $('defs')
	var stream = new Stream.Transform({ objectMode: true })

	stream._transform = function transform (file, encoding, cb) {

		if (file.isStream()) {
			return cb(new PluginError('gulp-svgstore-cs', 'Streams are not supported!'))
		}

		if (file.isNull()) return cb()


		var $svg = cheerio.load(file.contents.toString(), { xmlMode: true })('svg')

		if ($svg.length === 0) return cb()

		if (convertFont)
		{
			var $fonts = $svg.find('font');
			if($fonts.length === 0) return cb;

		}
		else
		{
			var idAttr = path.basename(file.relative, path.extname(file.relative))
			var viewBoxAttr = $svg.attr('viewBox')
			var preserveAspectRatioAttr = $svg.attr('preserveAspectRatio')
			var $symbol = $('<symbol/>')

			if (idAttr in ids) {
				return cb(new PluginError('gulp-svgstore-cs', 'File name should be unique: ' + idAttr))
			}

			ids[idAttr] = true

			if (!fileName) {
				fileName = path.basename(file.base)
				if (fileName === '.' || !fileName) {
					fileName = 'svgstore.svg'
				} else {
					fileName = fileName.split(path.sep).shift() + '.svg'
				}
			}

			if (file && isEmpty) {
				isEmpty = false
			}

			$symbol.attr('id', idAttr)
			if (viewBoxAttr) {
				$symbol.attr('viewBox', viewBoxAttr)
			}
			if (preserveAspectRatioAttr) {
				$symbol.attr('preserveAspectRatio', preserveAspectRatioAttr)
			}

			var attrs = $svg[0].attribs
			for (var attrName in attrs) {
				if (attrName.match(/xmlns:.+/)) {
					var storedNs = namespaces[attrName]
					var attrNs = attrs[attrName]

					if (storedNs !== undefined) {
						if (storedNs !== attrNs) {
							fancyLog.info(
								attrName + ' namespace appeared multiple times with different value.' +
								' Keeping the first one : "' + storedNs +
								'".\nEach namespace must be unique across files.'
							)
						}
					} else {
						for (var nsName in namespaces) {
							if (namespaces[nsName] === attrNs) {
								fancyLog.info(
									'Same namespace value under different names : ' +
										nsName +
										' and ' +
										attrName +
									'.\nKeeping both.'
								)
							}
						}
						namespaces[attrName] = attrNs;
					}
				}
			}

			var $defs = $svg.find('defs')
			if ($defs.length > 0) {
				$combinedDefs.append($defs.contents())
				$defs.remove()
			}

			$symbol.append($svg.contents())
			$combinedSvg.append($symbol)
		}
		cb()
	}

	stream._flush = function flush (cb) {
		if (isEmpty) return cb()
		if ($combinedDefs.contents().length === 0) {
			$combinedDefs.remove()
		}
		for (var nsName in namespaces) {
			$combinedSvg.attr(nsName, namespaces[nsName])
		}
		var file = new Vinyl({ path: fileName, contents: Buffer.from($.xml()) })
		this.push(file)
		cb()
	}

	return stream;
}

/*
function extractCharsFromFont(
  fontSvgText: string,
  charNameMap: Object,
  callbackFn: Function,
  processCharInfoFn: ?Function
): void {
  const doc = new DOMParser().parseFromString(
    fontSvgText,
    "text/xml"
  ).documentElement;
  const fontSpec = doc.getElementsByTagName("font")[0];
  const defaultCharWidth = fontSpec.getAttribute("horiz-adv-x");
  const fontFace = doc.getElementsByTagName("font-face")[0];
  const defaultCharHeight = fontFace.getAttribute("units-per-em");
  const defaultCharAscent = fontFace.getAttribute("ascent");
  const glyphs = doc.getElementsByTagName("glyph");

  //"square" fonts tend to be based at the center (like glyphicon)
  //white other fonts tend to be based around the charAscent mark
  //so when need to flip them with different adjustments
  //(defaultCharWidth == defaultCharHeight ? defaultCharHeight : defaultCharAscent),
  const translateOffset = defaultCharAscent;
  const charMap = charNameMap || {};
  const cleanCharacter = processCharInfoFn || ((char: string): string => char);

  let dataOnGlyphs: Array<IconInformation> = [];
  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    //some strange fonts put empty glyphs in them
    if (!glyph) continue;
    let iconCode = glyph.getAttribute("unicode");
    const pathData = glyph.getAttribute("d");
    const customWidthMatch = glyph.getAttribute("horiz-adv-x");
    const contentWidth = customWidthMatch ? customWidthMatch : defaultCharWidth;

    //some glyphs matched without a unicode value so we should ignore them
    if (!iconCode) continue;

    // handle encoded values
    if (iconCode.indexOf("&#") !== -1) {
      iconCode = iconCode.replace("&#x", "");
    }
    // handle unencoded values
    else {
      iconCode = iconCode.codePointAt(0).toString(16);
    }
    //Skip empty-looking glyphs
    if (!iconCode.length || !pathData || pathData.length < 10) continue;

    const useCharacterName = charMap[iconCode] ||
      glyph.getAttribute("glyph-name") ||
      iconCode;

    const charInfo: IconInformation = {
      code: iconCode,
      name: useCharacterName,
      ref: useCharacterName || iconCode,
      path: pathData,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${contentWidth} ${defaultCharHeight}">
        <g transform="scale(1,-1) translate(0 -${translateOffset})">
            <path d="${pathData}"/>
        </g></svg>`
    };
    dataOnGlyphs = dataOnGlyphs.concat(charInfo);
  }

  const cleanAllPromises = dataOnGlyphs.map((charInfo: IconInformation) => {
    return optimizeSvgText(charInfo.svg).then(cleanSvg => {
      let newInfo = Object.assign({}, charInfo, {
        svg: cleanSvg,
        path: cleanSvg.match(/d="(.*?)"/)[1]
      });
      if (cleanCharacter) newInfo = cleanCharacter(newInfo);
      return newInfo;
    });
  });

  var promise = Promise.all(cleanAllPromises);
  if (callbackFn){
    promise = promise.then(callbackFn);
  }
  return promise;
}
*/
