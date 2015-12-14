var config = require('../config.js')
var _ = require('../util')
var expParser = require('./expression.js')

var prefix = config.prefix

var delimiters = config.delimiters

var regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

function escapeRegex(str) {
  return str.replace(regexEscapeRE, '\\$&')
}

var dirRegx = new RegExp('^' + prefix + '-([^=]+)')
var argRegx = /:(.*)$/

var expressionRegx = /([^|]+)\|?([\sA-Za-z$_]*)/


var open = escapeRegex(config.delimiters[0])
var close = escapeRegex(config.delimiters[1])
var unsafeOpen = escapeRegex(config.unsafeDelimiters[0])
var unsafeClose = escapeRegex(config.unsafeDelimiters[1])

var tagRE = new RegExp(
  unsafeOpen + '(.+?)' + unsafeClose + '|' +
  open + '(.+?)' + close,
  'g'
)

var htmlRE = new RegExp(
  '^' + unsafeOpen + '.*' + unsafeClose + '$'
)

var interpolationRegx = new RegExp(
  unsafeOpen + '(.+?)' + unsafeClose + '|' +
  open + '(.+?)' + close
)


//解析指令
/**
 * 解析指令，这里分两种情况
 * 1. 普通属性上的插值指令  id="J_{{name}}"
 * 2. 指令属性   sk-for="xxx"
 *
 * @param  {Attr} attr 属性对象
 * @return 指令描述
 *
 * @example
 *
 * sk-bind='test.text'
 *
 * {
 *   expression:'@test.text',
 *   directive:'bind',
 *   name:'sk-bind',
 *   value:'test.text',
 *   args:[]
 *
 * }
 */
exports.parseDirective = function(attr) {
  var name = attr.name
  var value = attr.value
  var match, args, tokens, oneTime, html,directive,obj


  oneTime = html = false
  //value里面有插值的情况下，就认为是插值属性节点，普通指令不支持插值写法
  if (interpolationRegx.test(value)) {

    tokens = exports.parseText(value)
    //只要有一个是不转义的，所有的都不转义
    //只要有一个不是onetime，就整体都是要监听变更
    //是否用按位取 逻辑快点？ todo
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].html) {
        html = true
        break
      }
    }

    for (var i = 0; i < tokens.length; i++) {
      if (!tokens[i].oneTime) {
        oneTime = false
        break
      }else{
        oneTime = true
      }
    }

    return {
      name: name,
      value: value,
      directive: 'bind',
      args: [name],
      oneTime:oneTime,
      html:html,
      expression: exports.token2expression(tokens),
      isInterpolationRegx:true //标识一下是插值
    }
    //todo 判断如果这个时候还能找到指令需要报错
  }

  //普通指令解析
  //普通指令全部转义
  //普通指令全部不是onetime
  directive = name.match(dirRegx)[1]

  if (argRegx.test(directive)) {
    obj = directive.split(':')
    directive = obj[0]
    args = obj[1] ? obj[1].split('|') : []
  }

  return {
    name: name,
    value: value,
    directive: directive,
    args: args || [],
    oneTime:false,
    html:false,
    expression: exports.parseExpression(value)
  }
}

/**
 * 解析表达式,不需要支持太复杂的表达式
 * @param  {[type]} attr [description]
 * @return {string}
 *
 * @example
 *
 *   hello + 1 + "hello" | test
 *
 * @return
 *
 *   _that.applyFilter('_scope.hello + 1 + "hello"',test),
 *
 */
exports.parseExpression = function(text) {

  //要不要放开expression?? 还需要思考，可能带来比较多的问题
  //只支持很简单的逻辑符，加减等，不支持＝，--，++，

  // if (/(--)|(++)|(=[^=]?)/.test(text)) {
  //   //todo 给出错误提示
  // }

  var match = text.match(expressionRegx)
  var expression = _.trim(match[1])
  var filterName = _.trim(match[2])
  var body
  body = expParser.compileExpFns(expression)

  if (filterName) {
    body = '_that.applyFilter(' + body + ',"' + filterName + '")'
  }

  return body
}


TextTemplateParserTypes = {
  text: 0,
  binding: 1
}


/**
 * 用来解析一段文本，找出普通文本和 插值
 * @param  {text} text 一段文本
 * @return {array}    返回一个数组
 */
exports.parseText = function(text) {

  text = text.replace(/\n/g, '')

  //匹配不到插值说明是普通的，直接返回
  if (!tagRE.test(text)) {
    return [{
      type: TextTemplateParserTypes.text,
      value: text
    }]
  }

  var tokens = []
  var lastIndex = tagRE.lastIndex = 0
  var match, index, html, value, first, oneTime
  while (match = tagRE.exec(text)) {
    index = match.index
      // push text token
    if (index > lastIndex) {
      tokens.push({
        type: TextTemplateParserTypes.text,
        value: text.slice(lastIndex, index)
      })
    }
    // tag token
    html = htmlRE.test(match[0])
    value = html ? match[1] : match[2]
    first = value.charCodeAt(0)
    oneTime = first === 42 // *
    value = oneTime ? value.slice(1) : value
    tokens.push({
      type: TextTemplateParserTypes.binding,
      value: _.trim(value),
      html: html,
      oneTime: oneTime
    })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) {
    tokens.push({
      type: TextTemplateParserTypes.text,
      value: text.slice(lastIndex)
    })
  }

  return tokens;
}

/**
 * 用来将上面生成的token合成一个expression
 * @return {[type]} [description]
 */
exports.token2expression = function(tokens) {
  var mergedExpression = ''

  _.each(tokens, function(token) {
    mergedExpression += exports.parseExpression(token.value)
  })

  return mergedExpression
}

exports.INTERPOLATION_REGX = interpolationRegx
exports.DIR_REGX = dirRegx
exports.TextTemplateParserTypes = TextTemplateParserTypes