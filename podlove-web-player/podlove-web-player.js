var PODLOVE = PODLOVE || {};

(function (PODLOVE, $, MEP, window) {
	'use strict';

	var // Keep a reference to all players
		players = [],
		// Timecode as described in http://podlove.org/deep-link/
		// and http://www.w3.org/TR/media-frags/#fragment-dimensions
		timecodeRegExp = /(\d\d:)?(\d\d):(\d\d)(\.\d\d\d)?([,\-](\d\d:)?(\d\d):(\d\d)(\.\d\d\d)?)?/;

	/**
	 * return number as string lefthand filled with zeros
	 * @param number number
	 * @param width number
	 * @return string
	 **/
	function zeroFill(number, width) {
		width -= number.toString().length;
		return width > 0 ? new Array(width + 1).join('0') + number : number + '';
	}

	/**
	 * accepts time in seconds
	 * returns timecodepart in deep-linking format
	 * @param seconds number
	 * @return string
	 **/
	function generateTimecodePart(seconds) {
		var core, hours, milliseconds;
		// prevent negative values from player
		if (!seconds || seconds <= 0) {
			return '00:00';
		}

		// required (minutes : seconds)
		core = zeroFill(Math.floor(seconds / 60) % 60, 2) + ':' +
				zeroFill(Math.floor(seconds % 60) % 60, 2);

		hours = zeroFill(Math.floor(seconds / 60 / 60), 2);
		hours = hours === '00' ? '' : hours + ':';
		milliseconds = zeroFill(Math.floor(seconds % 1 * 1000), 3);
		milliseconds = milliseconds === '000' ? '' : '.' + milliseconds;

		return hours + core + milliseconds;
	}

	/**
	 * accepts array with start and end time in seconds
	 * returns timecode in deep-linking format
	 * @param times array
	 * @return string
	 **/
	function generateTimecode(times) {
		if (times[1] > 0 && times[1] < 9999999 && times[0] < times[1]) {
			return (generateTimecodePart(times[0]) +
					',' + generateTimecodePart(times[1]));
		}

		return generateTimecodePart(times[0]);
	}

	/**
	 * parses time code into seconds
	 * @param string timecode
	 * @return number
	 **/
	function parseTimecode(timecode) {
		var parts, startTime = 0, endTime = 0;

		if (timecode) {
			parts = timecode.match(timecodeRegExp);

			if (parts && parts.length === 10) {
				// hours
				startTime += parts[1] ? parseInt(parts[1], 10) * 60 * 60 : 0;
				// minutes
				startTime += parseInt(parts[2], 10) * 60;
				// seconds
				startTime += parseInt(parts[3], 10);
				// milliseconds
				startTime += parts[4] ? parseFloat(parts[4]) : 0;
				// no negative time
				startTime = Math.max(startTime, 0);

				// if there only a startTime but no endTime
				if (parts[5] === undefined) {
					return [startTime, false];
				}

				// hours
				endTime += parts[6] ? parseInt(parts[6], 10) * 60 * 60 : 0;
				// minutes
				endTime += parseInt(parts[7], 10) * 60;
				// seconds
				endTime += parseInt(parts[8], 10);
				// milliseconds
				endTime += parts[9] ? parseFloat(parts[9]) : 0;
				// no negative time
				endTime = Math.max(endTime, 0);

				return (endTime > startTime) ? [startTime, endTime] : [startTime, false];
			}
		}
		return false;
	}

	function checkUrlForDeeplink(url, player) {
		// parse deeplink
		var deeplink = parseTimecode(url || window.location.href),
			jqPlayer = $(player);

		if (deeplink !== false) {
			// Do only set current time if it will change
			if (parseInt(deeplink[0], 10) !== parseInt(player.currentTime, 10)) {
				jqPlayer.data('startAtTime', deeplink[0]);
			}
			jqPlayer.data('stopAtTime', deeplink[1]);

			if (player.pause || player.ended) {
				jqPlayer.trigger('timeupdate');
			}
		}
	}

	function setFragmentURL(fragment) {
		window.location.hash = fragment;
	}

	function renderChapterMark(player, mark) {
		var title, deeplink,
			permalink  = $(player).data('permalink') || window.location.href,
			startTime  = mark.data('start'),
			endTime    = mark.data('end'),
			isEnabled  = mark.data('enabled'),
			isBuffered = player.buffered.end(0) > startTime,
			isActive   = player.currentTime > startTime - 0.3 &&
					player.currentTime <= endTime;

		if (isActive) {
			mark
				.addClass('active')
				.siblings().removeClass('active');
		}
		if (!isEnabled && isBuffered) {
			deeplink = permalink + '#t=' + generateTimecode([startTime, endTime]);

			mark.data('enabled', true);

			title = mark.find('td.title');
			title.html('<a href="' + deeplink + '">' + title.html() + '</a>');
		}
	}

	// update the chapter list when the data is loaded
	function updateChapterMarks(player, marks) {
		marks.each(function () {
			renderChapterMark(player, $(this));
		});
	}

	function checkTime(player) {
		var jqPlayer    = $(player),
			startAtTime = jqPlayer.data('startAtTime'),
			stopAtTime  = jqPlayer.data('stopAtTime');

		if (startAtTime !== false) {
			player.setCurrentTime(startAtTime);
			jqPlayer.data('startAtTime', false);
		}
		if (stopAtTime !== false && player.currentTime >= stopAtTime) {
			jqPlayer.data('stopAtTime', false);
			player.pause();
			jqPlayer.data('startAtTime', false);
		}
	}

	function addressCurrentTime() {
		if (players.length > 1) {
			return;
		}
		var fragment,
			player      = players[0],
			jqPlayer    = $(player),
			startAtTime = jqPlayer.data('startAtTime'),
			stopAtTime  = jqPlayer.data('stopAtTime'),
			currentTime = player.currentTime;

		if (stopAtTime === false && startAtTime === false) {
			fragment = 't=' + generateTimecode([currentTime]);
			setFragmentURL(fragment);
		}
	}

	/**
	 * add chapter behavior and deeplinking: skip to referenced
	 * time position & write current time into address
	 * @param player object
	 */
	function addBehavior(player) {
		var jqPlayer  = $(player),
			playerId  = jqPlayer.attr('id'),
			list      = $('table[rel=' + playerId + ']'),
			marks     = list.find('tr'),
			isTarget  = parseTimecode(window.location.href) !== false &&
					players.length === 1;

		// chapters list
		list
			.show()
			.delegate('a', 'click', function (e) {
				e.preventDefault();

				var mark = $(this).closest('tr'),
					startTime = mark.data('start'),
					endTime = mark.data('end');

				// If there is only one player also set deepLink
				if (players.length === 1) {
					setFragmentURL('t=' + generateTimecode([startTime, endTime]));
				}

				jqPlayer.data('startAtTime', startTime);
				jqPlayer.data('stopAtTime', endTime);
				checkTime(player);

				if (player.pluginType !== 'flash') {
					player.play();
				}
			});

		// wait for the player or you'll get DOM EXCEPTIONS
		jqPlayer.bind('canplay', function () {
			// add Deeplink Behavior if there is only one player on the site
			if (players.length === 1) {
				//jqPlayer.bind('pause', addressCurrentTime);

				// handle browser history navigation
				$(window).bind('hashchange', function () {
					checkUrlForDeeplink(null, player);
				});

				// handle links on the page
				// links added later are not handled!
				$('a[href*="#t="]').bind('click', function () {
					checkUrlForDeeplink(this.href, player);
				});
			}

			// always update Chaptermarks though
			jqPlayer.bind({
				play: function () {
					checkTime(player);
				},
				timeupdate: function () {
					checkTime(player);
					updateChapterMarks(player, marks);
				}
			});
		});

		if (isTarget) {
			checkUrlForDeeplink(null, player);

			$('html, body')
				.delay(150)
				.animate({
					scrollTop: $('.mediaelementjs_player_container:first').offset().top - 25
				});
			player.play();
		}
	}


	PODLOVE.WebPlayer = function (playerId, options) {
		var jqPlayer = $('#' + playerId),
			player = jqPlayer[0];

		options = options || {};

		// Add options from data-attribute
		$.extend(options, jqPlayer.data('mejsoptions'));

		// Add extra behavior after MediaElement Player is initialized
		$.extend(options, {success: addBehavior});

		// kepp track on all players in the window
		players.push(player);

		// MediaElement Player
		MEP('#' + playerId, options);

		return player;
	};

	// Register jQuery Plugin: $('audio').podloveWebPlayer({});
	$.fn.podloveWebPlayer = function (options) {
		return $(this).each(function () {
			var element = $(this);

			if (!element.data('podloveWebPlayer')) {
				element.data('podloveWebPlayer',
						PODLOVE.WebPlayer(element.attr('id'), options));
			}
		});
	};

}(PODLOVE, jQuery, MediaElementPlayer, window));
