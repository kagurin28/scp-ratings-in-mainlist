// Hopefully it won't be too much of a pain to change these once you download the extension
const RATING1_MIN = 100;
const RATING2_MIN = 400;
const RATINGHIGHEST_MIN = 1000;

const RATING2_COLOR = 'blue';
const RATINGHIGHEST_COLOR = 'yellow';

// 0: no logging, 1: normal logging, 2: heavy logging
const LOGLEVEL = 1;


function ajax(url, callbackSuccess, callbackFail)
{
	var httpRequest = new XMLHttpRequest();
	if (!httpRequest) return false;
	
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
	
	if (url.indexOf('?') == -1) url += '?'; else url += '&';
	url += 'nocache=1';
	httpRequest.open('GET', url);
	httpRequest.setRequestHeader('Content-Type', 'text/plain');
	httpRequest.overrideMimeType('text/plain');
	httpRequest.send();
	return true;
}

function CreateRatingCss()
{
	var style = document.createElement('style');
	style.type = 'text/css';
	style.innerHTML = '	.rating { position: absolute; top: 0%; right: 0%; } \
						.rating1 { font-weight: bold; } \
						.rating2 { font-weight: bold; color: '+RATING2_COLOR+'; } \
						.ratingHighest { font-weight: bold; color: '+RATINGHIGHEST_COLOR+'; }';
	
	document.getElementsByTagName('head')[0].appendChild(style);
	
	if (LOGLEVEL >= 2) console.log('Created CSS for rating elements.');
}

function CreateRatingDisplay(parent, url, headingName, itemNo)
{
	parent.style.position = 'relative'; // Needed for absolute positioning
	
	const ratingElement = document.createElement('span');
	ratingElement.classList.add('rating');
	ratingElement.innerHTML = 'Loading...';
	parent.appendChild(ratingElement);
	
	ajax(url, function(response)
	{ // Success
		
		const parser = new DOMParser();
		
		// Don't even ask me why they use this class name for the rating number
		const rating = parser.parseFromString(response, 'text/html').getElementsByClassName('prw54353')[0];
		
		if (!rating)
		{
			ratingElement.remove();
			if (LOGLEVEL >= 1) console.warn('Failed to get rating for heading \''+headingName+'\', list item '+itemNo+' from URL '+url);
		}
		
		if (LOGLEVEL >= 2) console.log('Got rating '+rating.innerHTML+' for heading \''+headingName+'\', list item '+itemNo+'.');
		
		if (+rating.innerHTML >= RATING1_MIN && +rating.innerHTML < RATING2_MIN)
			ratingElement.classList.add('rating1');
		else if (+rating.innerHTML >= RATING2_MIN && +rating.innerHTML < RATINGHIGHEST_MIN)
			ratingElement.classList.add('rating2');
		else if (+rating.innerHTML >= RATINGHIGHEST_MIN)
			ratingElement.classList.add('ratingHighest');
		
		ratingElement.innerHTML = rating.innerHTML;
	}, function()
	{ // Failure
		
		ratingElement.remove();
		if (LOGLEVEL >= 2) console.warn('Failed to retrieve URL '+url);
	});
}

function ProcessList(ul, itemType, headingName)
{
	/*	This function was originally made for just the normal mainlist pages, so its system of logging
		based on the header name is a bit clunky for the weirdly set out pages like the Joke SCP list */
		
	if (LOGLEVEL >= 1) console.log('Processing heading \''+headingName+'\'...');
	
	var items = ul.getElementsByTagName(itemType); // This gets the grandchildren as well, so it makes doing the Tales Edition lists far easier
	for (var i = 0; i < items.length; i++)
	{
		const scpLink = items[i].getElementsByTagName('a')[0];
		
		if (scpLink)
			CreateRatingDisplay(items[i], scpLink.href, headingName, i);
		else
			console.warn('No link in heading \''+headingName+'\', list item '+i+'.');
	}
}


// MAIN EXECUTION STARTS HERE

if (LOGLEVEL >= 2) console.log('Content script loaded.');

if (window.location.pathname.match(/^\/((scp-series(-[0-9]+)?(-tales-edition)?)|joke-scps(-tales-edition)?|scp-ex|explained-scps-tales-edition|scp-001)$/))
{
	if (LOGLEVEL >= 2) console.log('Page is valid for showing ratings.');
	
	CreateRatingCss();
	
	/*	This is what happens when there is no standard for how pages should be set out. Now I have to have half a
		dozen ways to go through each individual page and pick out the listings. */
	if (window.location.pathname.match(/^\/(scp-series(-[0-9]+)?(-tales-edition)?)|joke-scps-tales-edition|scp-ex|explained-scps-tales-edition$/))
	{
		// This gets the <ul> immediatly following each header
		
		var i;
		if (window.location.pathname == '/scp-ex')
			i = 0;
		else
			i = 1;
		
		for (; i < Infinity; i++)
		{
			const heading = document.getElementById('toc'+i);
			if (!heading) break;
			
			var ul = heading.nextElementSibling;
			while (ul && ul.tagName != 'UL' && ul.id != 'toc'+(i + 1))
				ul = ul.nextElementSibling;
				
			if (!ul) break;
			if (ul.id == 'toc'+(i + 1)) continue;
			
			var headingText = heading.getElementsByTagName('span')[0];
			if (headingText)
				headingText = headingText.innerHTML
			else
				headingText = 'Unnamed Header';
			ProcessList(ul, 'li', headingText);
		}
	
	} else if (window.location.pathname == '/joke-scps')
	{
		// This gets each <ul> inside each element with the 'series' class
		
		const divs = document.getElementsByClassName('series');
		for (var i = 0; i < divs.length; i++)
		{
			var uls = divs[i].getElementsByTagName('ul');
			
			var headingText = divs[i].getElementsByTagName('h1')[0];
			if (headingText)
			{
				headingText = headingText.getElementsByTagName('span')[0];
				if (headingText)
					headingText = headingText.innerHTML;
				else
					headingText = 'Unnamed Header';
			} else
				headingText = 'Unnamed Header';
			
			for (var j = 0; j < uls.length; j++)
			{
				
				ProcessList(uls[j], 'li', headingText+' '+j);
			}
		}
	
	} else if (window.location.pathname == '/scp-001')
	{
		/*	For now, I can only do the old 'release order' listing, that shows when you click the link in
			the top corner, as the 'random' listing is in an <iframe> from a different domain, which makes
			it untouchable for security reasons.
			It may be possible with a bit of trickery, though */
		
		var list = document.getElementById('wiki-tab-0-1');
		ProcessList(list, 'p', 'Release Order');
	}
}
