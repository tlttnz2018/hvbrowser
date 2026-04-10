export function dict2Regex(dictionary) {
    var pattern = [],
        key;
    for (key in dictionary) {
        // Sanitize the key, and push it in the list
        pattern.push(key.replace(/([[^$.|?*+(){}])/g, '\\$1'));
    }
    pattern = "(?:" + pattern.join(")|(?:") + ")"; //Create pattern
    pattern = new RegExp(pattern, "g");
    return pattern;
}
export function toVP(content, dictionary) {
    // Walk through the string, and replace every occurrence of the matched tokens
    content = content.replace(pattern, function(full_match){
        return dictionary[full_match];
    });
    return content;
}