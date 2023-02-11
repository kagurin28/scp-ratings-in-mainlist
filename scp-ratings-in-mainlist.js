const SITE = 'https://scp-wiki.wikidot.com';

const RATING1_MIN = 100;
const RATING2_MIN = 400;
const RATINGHIGHEST_MIN = 1000;

const RATING2_COLOR = 'blue';
const RATINGHIGHEST_COLOR = 'yellow';

const CENSOR_BAR_MIN_LEN = 3;
const CENSOR_BAR_MAX_LEN = 6;

// How long, in milliseconds, the cache is valid for (default two months)
const CACHE_EXPIRES = 1000 * 60 * 60 * 24 * 60;

const domParser = new DOMParser();


// GENERAL FUNCTIONS
function SetHttpRequestCallback(httpRequest, callbackSuccess, callbackFail)
{
	httpRequest.onreadystatechange = function()
	{
		if (httpRequest.readyState === XMLHttpRequest.DONE)
		{
			if (httpRequest.status === 200)
				callbackSuccess(httpRequest.responseText);
			else
				callbackFail(httpRequest.responseText);
		}
	};
	httpRequest.ontimeout = function() { callbackFail(); };
}

function ajax(url, callbackSuccess, callbackFail)
{
	let httpRequest = new XMLHttpRequest();
	if (!httpRequest) return false;
	
	SetHttpRequestCallback(httpRequest, callbackSuccess, callbackFail)
	
	httpRequest.open('GET', url);
	httpRequest.setRequestHeader('Content-Type', 'text/plain');
	httpRequest.overrideMimeType('text/plain');
	httpRequest.send();
	return true;
}

function RandRange(min, max) { return Math.floor(Math.random() * (max + 1 - min)) + min; }

function CensoredText()
{
	switch (Math.floor(Math.random() * 3))
	{
		case 0:
			return '[REDACTED]';
		case 1:
			return '[DATA EXPUNGED]';
		case 2:
			return '█'.repeat(RandRange(CENSOR_BAR_MIN_LEN, CENSOR_BAR_MAX_LEN));
	}
}

function ScpPathToMainList(path)
{
	let scpNo = path.match(/\/scp-((?!0{3,})\d{3,})/);
	if (!scpNo)
		return;
	scpNo = +scpNo[1];
	
	const series = Math.floor(scpNo / 1000) + 1;
	if (series == 1)
		return '/scp-series';
	else
		return '/scp-series-'+series;
}


// SCRAPING FUNCTIONS
function ScrapeAltTitleFromP(page, path)
{
	const as = page.getElementsByTagName('a');
	for (let i = 0, l = as.length; i < l; i++)
	{
		if (as[i].pathname == path)
		{
			const text = as[i].parentElement.innerText;
			let m = text.match(/.* - (.*)/)[1];
			if (!m)
				m = text; // If it is not normal (doesn't contain ' - '), then just use the whole thing, link and all
			n = m.match(/(.*) by Loading\.\.\..*/)[1];
			if (n)
				return n;
			else
				return m;
		}
	}
	return;
}

function ScrapeAltTitle(path, callbackSuccess, callbackFail)
{
	const mainList = ScpPathToMainList(path);
	if (!mainList) { callbackFail(); return false; }
	
	if (window.location.pathname == mainList) // If the user is already on the mainlist page that it needs
	{
		let altTitle = ScrapeAltTitleFromP(document, path)
		if (altTitle)
		{
			callbackSuccess(altTitle);
			return true;
		} else { callbackFail(); return false; }
	}
	
	ajax(SITE+mainList, function(page)
	{ // Success
		let altTitle = ScrapeAltTitleFromP(domParser.parseFromString(page, 'text/html'), path);
		if (altTitle)
			callbackSuccess(altTitle);
		else
			callbackFail();
	}, callbackFail);
	return true;
}

function ScrapeScpRating(page)
{
	const rating = page.getElementsByClassName('prw54353')[0]; // Don't even ask me why they use this class name
	if (rating)
		return +rating.innerHTML;
}

// Takes an unparsed page instead of parsed like all the other functions
function ScrapeScpAuthor(page, callbackSuccess, callbackFail)
{
	const wikidotPageId = page.match(/WIKIREQUEST\.info\.pageId = (.*);/)[1];
	if (!wikidotPageId) { callbackFail(); return false; }
	const wikidotToken = document.cookie.match(/wikidot_token7=(.*);?/)[1];
	if (!wikidotToken) { callbackFail(); return false; }
	
	let httpRequest = new XMLHttpRequest();
	
	SetHttpRequestCallback(httpRequest, function(response)
	{
		// Parsing the author out of the page
		const jsonResponse = JSON.parse(response);
		if (jsonResponse.body)
		{
			const rows = domParser.parseFromString(jsonResponse.body, 'text/html').getElementsByClassName('page-history')[0].rows;
			author = rows[rows.length - 1].cells[4].getElementsByTagName('a')[1].innerHTML;
			
			callbackSuccess(author);
		} else { callbackFail(); return false; }
	
	}, callbackFail);
	
	httpRequest.open('POST', SITE+'/ajax-module-connector.php');
	
	httpRequest.withCredentials = true; // Important for the cookie
	httpRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	httpRequest.overrideMimeType('text/plain');
	
	httpRequest.send(
		'page=1&'+
		'perpage=1000000&'+
		'page_id='+wikidotPageId+'&'+
		'moduleName=history%2FPageRevisionListModule&'+
		'wikidot_token7='+wikidotToken);
	
	return true;
}

// Gets the author and rating
function ScrapeScpPageData(path, callback)
{
	ajax(SITE+path, function(response)
	{ // Success
		
		let retVal = {};
		const htmlResp = domParser.parseFromString(response, 'text/html');
		
		const rating = ScrapeScpRating(htmlResp);
		if (rating)
			retVal.rating = rating;
		else
			console.warn('Could not get rating for '+path);
		
		ScrapeScpAuthor(response, function(author)
		{
			retVal.author = author;
			callback(retVal);
		}, function(){ console.warn('Could not get author for '+path); });
			
	}, function(){});
}

// GET WRAPPER
/*	This function either gets the values from cache or, if they are not cached, downloads
	the web page, scrapes the values and caches them */
function GetScpInfo(path, callback)
{
	chrome.storage.local.get(path, function(savedInfo)
	{
		if (savedInfo[path] && savedInfo[path].expires > Date.now())
		{
			callback(savedInfo[path]);
		} else
		{ // Scrape everything
			let info = {};
			info[path] = {};
			ScrapeAltTitle(path, function(altTitle)
			{
				info[path].altTitle = altTitle;
				ScrapeScpPageData(path, function(data)
				{
					info[path] = Object.assign(info[path], data);
					info[path].expires = Date.now() + CACHE_EXPIRES;
					
					chrome.storage.local.set(info);
					callback(info[path]);
				});
			
			}, function()
			{ // Non-SCP pages (e.g. tales) do not have a main list title
				console.log('Could not get main list title for '+path);
				
				ScrapeScpPageData(path, function(data)
				{
					info[path] = data;
					info[path].expires = Date.now() + CACHE_EXPIRES;
					
					chrome.storage.local.set(info);
					callback(info[path]);
				});
			});
		}
	});
}

// SETTING OUT STUFF ON THE PAGE FUNCTIONS
function CreateRatingCss()
{
	let style = document.createElement('style');
	style.type = 'text/css';
	style.innerHTML = '	.rating { position: absolute; top: 0%; right: 0%; } \
						.rating1 { font-weight: bold; } \
						.rating2 { font-weight: bold; color: '+RATING2_COLOR+'; } \
						.ratingHighest { font-weight: bold; color: '+RATINGHIGHEST_COLOR+'; }';
	
	document.getElementsByTagName('head')[0].appendChild(style);
}

function CreateRatingDisplay(parent, path)
{
	parent.style.position = 'relative'; // Needed for absolute positioning
	
	const authorElementCont = document.createElement('i');
	authorElementCont.innerHTML = ' by ';
	const authorElement = document.createElement('span');
	authorElement.innerHTML = 'Loading...';
	authorElementCont.appendChild(authorElement);
	parent.appendChild(authorElementCont);
	
	const ratingElement = document.createElement('span');
	ratingElement.classList.add('rating');
	ratingElement.innerHTML = 'Loading...';
	parent.appendChild(ratingElement);
	
	GetScpInfo(path, function(info)
	{ // Success
		if (info.rating)
		{
			if (info.rating >= RATING1_MIN && info.rating < RATING2_MIN)
				ratingElement.classList.add('rating1');
			else if (info.rating >= RATING2_MIN && info.rating < RATINGHIGHEST_MIN)
				ratingElement.classList.add('rating2');
			else if (info.rating >= RATINGHIGHEST_MIN)
				ratingElement.classList.add('ratingHighest');
			
			if (info.rating > 0)
				ratingElement.innerHTML = '+'+info.rating;
			else
				ratingElement.innerHTML = info.rating;
		} else
			ratingElement.remove();
		
		if (info.author)
			authorElement.innerHTML = info.author;
		else
			authorElement.innerHTML = CensoredText();
	});
}

function ProcessList(ul, itemType)
{
	let items = ul.getElementsByTagName(itemType); // This gets the grandchildren as well, so it makes doing the Tales Edition lists far easier
	for (let i = 0, l = items.length; i < l; i++)
	{
		const scpLink = items[i].getElementsByTagName('a')[0];
		
		if (scpLink)
			CreateRatingDisplay(items[i], scpLink.pathname);
		else
			console.warn('No link!');
	}
}


// MAIN EXECUTION STARTS HERE
if (window.location.pathname.match(/^\/((scp-series(-[0-9]+)?(-tales-edition)?)|joke-scps(-tales-edition)?|scp-ex|explained-scps-tales-edition|scp-001)$/))
{
	CreateRatingCss();
	if (window.location.pathname.match(/^\/(scp-series(-[0-9]+)?(-tales-edition)?)|joke-scps-tales-edition|scp-ex|explained-scps-tales-edition$/))
	{
		// This gets the <ul> immediatly following each header
		
		let i;
		if (window.location.pathname == '/scp-ex')
			i = 0;
		else
			i = 1;
		
		for (; i < Infinity; i++)
		{
			const heading = document.getElementById('toc'+i);
			if (!heading) break;
			
			let ul = heading.nextElementSibling;
			while (ul && ul.tagName != 'UL' && ul.id != 'toc'+(i + 1))
				ul = ul.nextElementSibling;
				
			if (!ul) break;
			if (ul.id == 'toc'+(i + 1)) continue;
			
			ProcessList(ul, 'li');
		}
	
	} else if (window.location.pathname == '/joke-scps')
	{
		// This gets each <ul> inside each element with the 'series' class
		
		const divs = document.getElementsByClassName('series');
		for (let i = 0, l = divs.length; i < l; i++)
		{
			let uls = divs[i].getElementsByTagName('ul');
			
			for (let j = 0, ll = uls.length; j < ll; j++)
				ProcessList(uls[j], 'li');
		}
	
	} else if (window.location.pathname == '/scp-001')
	{
		/*	For now, I can only do the old 'release order' listing, that shows when you click the link in
			the top corner, as the 'random' listing is in an <iframe> from a different domain, which makes
			it untouchable for security reasons.
			It may be possible with a bit of trickery, though */
		
		let list = document.getElementById('wiki-tab-0-1');
		ProcessList(list, 'p');
	}
}
