var brandProductName = 'Nextcloud Office';
var brandProductURL = 'https://nextcloud.com/office';
var brandProductFAQURL = 'https://nextcloud.com/office';

var menuItems;
var applyBranding = function() {

	function getCustomLogoUrl() {
		let customLogo = getComputedStyle(document.documentElement).getPropertyValue('--nc-custom-logo');
		let customLogoUrl;
		if (customLogo !== '') {
			customLogoUrl = decodeURIComponent(customLogo);
		}
		return customLogoUrl;
	}

	// wait until the menu (and particularly the document-header) actually exists
	function setLogo() {
		let logoHeader = document.getElementById('document-header');

		if (!logoHeader) {
			// the logo does not exist in the menu yet, re-try in 250ms
			setTimeout(setLogo, 250);
		} else {
			menuItems = document.querySelectorAll('#main-menu > li > a');
		}
	}

	// The About dialog is a copy of this template, made each time it opens
	function setAboutImg() {
		var aboutTemplate = document.querySelector('dialog > #about-dialog');
		var info = aboutTemplate && aboutTemplate.querySelector('#about-dialog-info');
		if (!info)
			return;

		let customLogoUrl = getCustomLogoUrl();
		if (customLogoUrl) {
			let integratorLogo = aboutTemplate.querySelector('#integrator-logo');
			if (integratorLogo)
				integratorLogo.style.backgroundImage = 'url("' + customLogoUrl + '")';
		}

		if (info.querySelector('#lokit-extra'))
			return;

		var div = document.createElement('div');
		div.style.marginInlineEnd = 'auto';
		div.id = 'lokit-extra';

		let span = document.createElement('span');
		span.setAttribute('dir', 'ltr');
		span.textContent = 'built on\u00A0';

		let anchor = document.createElement('a');
		anchor.href = 'https://col.la/lot';
		anchor.setAttribute('target', '_blank');
		anchor.textContent = 'a great technology base';

		div.appendChild(span);
		div.appendChild(anchor);
		info.prepend(div);
	}

	function cssUrlsRenamerSocketProxy() {
		var replaceUrls = function(rules, replaceBase) {
			if (!rules)
				return;

			for (var r = 0; r < rules.length; ++r) {
				// check subset of rules like @media or @import
				if (rules[r] && rules[r].type != 1) {
					replaceUrls(rules[r].cssRules || rules[r].rules, replaceBase);
					continue;
				}
				if (!rules[r] || !rules[r].style)
					continue;
				var img = rules[r].style.backgroundImage;
				if (img === '' || img === undefined)
					continue;
				if (img.startsWith('url("images/'))
				{
					rules[r].style.backgroundImage =
						img.replace('url("images/', replaceBase + '/images/');
				}
				if (img.startsWith('url("remote/'))
				{
					rules[r].style.backgroundImage =
						img.replace('url("remote/', replaceBase + '/remote/');
				}
			}
		};
		var sheets = document.styleSheets;
		for (var i = 0; i < sheets.length; ++i) {
			var relBases;
			try {
				relBases = sheets[i].href.split('/');
			} catch {
				window.app.console.log('Missing href from CSS number ' + i);
				continue;
			}
			relBases.pop(); // bin last - css name.
			var replaceBase = 'url("' + relBases.join('/');

			var rules;
			try {
				rules = sheets[i].cssRules || sheets[i].rules;
			} catch (err) {
				window.app.console.log('Missing CSS from ' + sheets[i].href);
				continue;
			}
			replaceUrls(rules, replaceBase);
		}
	};

	setLogo();
	setAboutImg();

	if (window.socketProxy) {
		cssUrlsRenamerSocketProxy();
	}
};

window.addEventListener('load', applyBranding);
window.initializedUI = applyBranding; // will be called on UI init (also after mode switch)

/*a::first-letter"*/
document.onkeyup = function(e) {
	if (e.altKey && e.shiftKey) {
		menuItems.forEach(function(menuItem) {
			menuItem.style.setProperty('text-decoration', 'underline', 'important');
		});
	}
};
