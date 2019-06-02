function extractContextUrl(url) {
    const pathArray = url.split( '/' );
    if (pathArray.length > 4) {
        pathArray.splice(-1, 1);
    }

    const protocol = pathArray.splice(0, 1);
    let contextUrl = protocol + '//' + pathArray.join('/');
    return contextUrl.replace("///", "//");
}

export function extractBaseUrl(url) {
    var pathArray = url.split( '/' );
    var protocol = pathArray[0];
    return protocol + '//' + pathArray[2];
}

export function absolute(current, relative) {
    // console.log(`Base ${current} and ${relative}`);

    if('string'!==typeof relative || !relative){
        return relative; // wrong or empty url
    } else if(relative.match(/^[a-z]+\:\/\//i)){
        return relative; // url is absolute already
    } else if(relative.match(/^\/\//)){
        return 'http:'+relative; // url is absolute already
    } else if(relative.match(/^[a-z]+\:/i)){
        return relative; // data URI, mailto:, tel:, etc.
    } else if(relative.match(/^(www\.|m\.|sj\.|wap\.)/)) { // www./m./sj.
        return relative; // /href already kind of absolute.
    }

    // Now we need two base url
    // One is the base of current context, so anything relative to it will use baseContext
    // Another one is really base which will apply for relative like /book.
    const contextUrl = extractContextUrl(current);
    // console.log(`Context url: ${contextUrl}`);
    const rootUrl = extractBaseUrl(current);
    // console.log(`Root url: ${rootUrl}`);
    const base = relative.match(/^\//) ? rootUrl : contextUrl;

    // console.log(`After extract base: ${base}`);
    // console.log('Relative url: ', relative);

    const stack = base.split("/");

    // Processing url parts
    let lastSegment = stack.pop();
    if(!lastSegment.match(/(html|aspx|htm|php)/)) {
        stack.push(lastSegment);
    }

    // Relative
    let parts = relative.split("/");
    if (relative.match(/^\//)) {
        parts.splice(0, 1); // Remove / absolute
    }

    for (let i=0; i<parts.length; i++) {
        if (parts[i] === ".")
            continue;
        if (parts[i] === "..")
            stack.pop();
        else
            stack.push(parts[i]);
    }

    let absoluteUrl = stack.join("/").replace("///", "//");
    return absoluteUrl;
}

export function fixUrl(currentUrl, nextUrl) {
    var url = nextUrl;

    // console.log("Url clicked: " + url);
    if (!!currentUrl) {
        url = absolute(currentUrl, url);
        // console.log("After absolute: " + url);
    }

    return url;
}
