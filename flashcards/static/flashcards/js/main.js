var SpeechRecognition = window.mozSpeechRecognition ||
	window.msSpeechRecognition ||
	window.oSpeechRecognition ||
	window.webkitSpeechRecognition ||
	window.SpeechRecognition;

$(function(){
	if (SpeechRecognition) {
		$(".warnings")
			.html("Cool!  Your browser supports speech recognition.  Have fun!");
	} else {
		$(".warnings")
			.addClass("unsupported")
			.html("Sorry... Your browser doesn't support speech recognition yet.");
	}
});

function getCookie(name) {
    var cookieValue = null;
    if (document.cookie && document.cookie != '') {
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = jQuery.trim(cookies[i]);
            // Does this cookie string begin with the name we want?
            if (cookie.substring(0, name.length + 1) == (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function SpeechFlashCardApplication(default_language, done_sound_file){
	// Save a copy of a pointer to the current object, to use when we want to
	// refer to members of the current object in a different context.
	var _this = this;

	// Mapping of collection id's to collection paramaters
	var collections = {};
	// Currently selected collection
	var selected_collection = null;
	// Currently rendered card
	var current_card = null;
	// Scores
	var score = 0, highscore = 0;

	// Whether there is a session active
	var session_active = false;
	// Total number of seconds for a flashcard session.
	var max_session_seconds = 60;
	// Reference to the current timer
	var timer = null;
	// Reference to the current animation frame for timer rendering, if any.
	var timer_animation_frame = null;
	// Current number of seconds active in the session
	var current_session_seconds = 0;
	// Whether the accure time can be used
	var accurate_time = (window.requestAnimationFrame && window.performance);
	// The number of milliseconds since EPOCH when the timer was started.
	var timer_begin = null;
	// Reference to the canvas of the timer graphic
	var timer_graphic_canvas = $("#cnvTimer")
	// Reference to the 2D rendering context of the timer graphic.
	var timer_graphic_context = timer_graphic_canvas.get(0).getContext('2d');

	// Current language to use in speech recognition
	var speech_language = default_language;
	// Reference to current speech recognizer
	var speech_recognizer = null;

	// Reference to the done sound
	var done_sound = new Audio(done_sound_file);

	this.init = function(collections_api){
		// Ensure the CSRF token is set for AJAX requests
		$.ajaxSetup({
			beforeSend: function(xhr, settings) {
				safe = /^(GET|HEAD|OPTIONS|TRACE)$/.test(settings.type);
				if (!safe && !this.crossDomain) {
					xhr.setRequestHeader("X-CSRFToken", getCookie("csrftoken"));
				}
			}
		});
		$.get(collections_api, function(data){
			var item;
			for(var i = 0; i < data.length; i++){
				// Save a mapping from each collection's id to it's parameters.
				collections[data[i]['id']] = data[i];
				// Add collection to collection selector
				item = _this.render_collection_option(data[i]);
				// Select the first collection
				if(i == 0){
					_this.select_collection(data[i]['id'], item);
				}
			}
		})
	};

	// Get the highscore for the current collection
	this.get_collection_highscore = function(){
		if(window.localStorage){
			var h = localStorage.getItem("highscore-"+
					_this.select_collection['id']);
			highscore = (h ? h : 0);
		} else {
			highscore = 0;
		}
		$("#highScoreValue").html(highscore);
		return highscore;
	}

	// Set the highscore for the current collection
	this.set_collection_highscore = function(new_highscore){
		if(window.localStorage){
			localStorage.setItem(
				"highscore-"+_this.select_collection['id'], new_highscore);
		}
		highscore = new_highscore;
		$("#highScoreValue").html(highscore);
	}

	// Display a new collection in the collection selector
	this.render_collection_option = function(collection){
		item = $("<li>")
					.addClass("category")
					.html(collection['title'])
					.on("click", function(){
						_this.select_collection(collection['id'], this);
					});
		$("#categoryList").append(item);
		return item
	};

	// Select a new collection by its collection_id
	this.select_collection = function(collection_id, selector_item){
		if( selected_collection ){
			// Unload the current selected collection
			$("#categoryList li.selected").removeClass("selected");
		}
		// Store new selected collection
		selected_collection = collections[collection_id];
		// Add visual effect to new selected collection
		$(selector_item).addClass("selected");
		// Update collection highscore
		highscore = _this.get_collection_highscore();
	};

	// Retrieve a new card from the selected collection
	this.select_next_card = function(callback){
		$.get(selected_collection.card, function(data){
			if(current_card == data){
				// If the new card is already displayed, request a new one.
				_this.select_next_card(callback);
			} else {
				current_card = data;
				_this.display_card(data)
				if(callback){
					callback(data);
				}
			}
		});
	};

	// Display a card's question
	this.display_card = function(card){
		$("#problem").html(card['question'])
	};

	// Check the provided answer with the current card.
	// If its correct, update the score and move on.
	this.check_answer = function(answer){
		var answer = answer.trim().toLowerCase();
		if (answer.indexOf('stop') >= 0){
			_this.select_next_card();
			return;
		}

		$.post(current_card.check, {'answer': answer}, function(correct){
			if(correct){
				$("#currentScoreValue").html(++score);

				if (score > highscore) {
					$("#currentScoreValue").addClass('highlight');
				}

				_this.select_next_card();
			}
		})
	};

	// Set language to use in speech recognition
	this.set_language = function(language){
		speech_language = language;
		if(session_active){
			_this.stop_session();
		}
	};

	// Initialize a new session of answering flash cards.
	this.init_session = function(){
		if(session_active){
			_this.stop_session();
		}
		_this.start_speech_recognition();
	};

	this.start_speech_recognition = function(){
		speech_recognizer = new SpeechRecognition();
		speech_recognizer.continuous = true;
		speech_recognizer.interimResults = true;
		speech_recognizer.lang = speech_language;
		speech_recognizer.onstart = _this.start_session();
		speech_recognizer.onend = function(){
			if(session_active) _this.stop_session();
		}
		speech_recognizer.onerror = function(e){
			if(window.console && window.console.log){
				console.log("Speech error");
				console.log(e)
			}
			speech_recognizer.onend(e);
		};
		speech_recognizer.onresult = function(event){
			var text = ""
			for (var i = event.resultIndex; i < event.results.length; i++) {
				if (!event.results[i].isFinal) {
					text += event.results[i][0].transcript;
				}
			}
			$("#iHeardText").html(text);
			_this.check_answer(text);
		}
		speech_recognizer.start();
	};

	// Start the session with the timer
	this.start_session = function(){
		session_active = true;
		$('.scores').removeClass('hidden');
		$('.card').removeClass('hidden');
		$('.Heard').removeClass('hidden');
		$('.secondInstructions').empty();

		// Reset score
		score = 0;
		$("#currentScoreValue").html(score);

		// Select first problem, when loaded start timer.
		_this.select_next_card(function(){
			_this.init_timer();
		});
	}

	// Initialize the timer for this session
	this.init_timer = function(){
		// Ensure the old timer is stopped.
		if( timer ){ clearTimeout(timer); timer = null; }
		// Reset the current number of seconds
		current_session_seconds = 0;
		// Set the starting timestamp
		if(accurate_time){
			timer_begin = window.performance.now();
		}else{
			timer_begin = +new Date();
		}
		// Render first timer graphic
		_this.render_timer(timer_begin);
		// Render first timer text
		$('.timeRemaining').html(max_session_seconds).removeClass('expired');
		// Trigger a new timer loop
		_this.trigger_timer();
	}

	// Trigger a new timer until session ends,
	// update current_session_seconds in the mean time.
	this.trigger_timer = function(){
		if( (current_session_seconds + 1) == max_session_seconds ){
			_this.stop_session();
		} else {
			timer = setTimeout(_this.trigger_timer, 1000);
			current_session_seconds++;
			$('.timeRemaining').html(
					max_session_seconds-current_session_seconds);

			if(!accurate_time){
				// Update timer rendering in this loop, if the
				// requestAnimationFrame API is not defined.
				this.render_timer(+new Date());
			}
		}
	}

	// Render the timer on the screen. If a second argument is passed
	// containing `true`, the rendering will stop after updating.
	this.render_timer = function(current_time, stop){
		// Schedule timer paint
		if(accurate_time){
			if(stop && timer_animation_frame){
				window.cancelAnimationFrame(timer_animation_frame);
			} else {
				timer_animation_frame = window.requestAnimationFrame(
						_this.render_timer);
			}
		}
		var ratio;
		if(current_time == timer_begin){
			ratio = 0;
		}else{
			ratio = 1-((current_time-timer_begin)/(max_session_seconds*1000));
		}
		// Clear the current timer graphic
		timer_graphic_context.clearRect(0, 0, 1000, 1000);
		// Determine the radius r
		var r = (timer_graphic_canvas.height() / 2) - 5;
		// Create gradient
		var gradient = timer_graphic_context.createRadialGradient(
				r + 5, r + 5, r - 15, r - 5, r - 5, r + 10);
		// Add colors to gradient
		gradient.addColorStop(0,
			'rgb(' + Math.ceil(255-(255*r)) + ', ' + Math.ceil(255*r) + ', 0)');
		gradient.addColorStop(1, "black");

		// Fill with gradient
		timer_graphic_context.fillStyle = gradient;
		timer_graphic_context.lineWidth = 4;
		timer_graphic_context.beginPath();
		timer_graphic_context.arc(r + 5, r + 5, r, Math.PI * 3 / 2,
				Math.PI * 2 * ratio - ( Math.PI / 2 ), false);
		timer_graphic_context.lineTo(r + 5, r + 5);
		timer_graphic_context.closePath();
		timer_graphic_context.stroke();
		timer_graphic_context.fill();
	}

	this.stop_timer = function(){
		if( timer ){ clearTimeout(timer); timer = null; }
		if(accurate_time){
			_this.render_timer(window.performance.now(), true);
		}else{
			_this.render_timer(+Date(), true);
		}
		$('.timeRemaining').html(max_session_seconds).addClass("expired");
	}

	this.stop_session = function(){
		session_active = false;
		if(speech_recognizer){
			// Stop speech recognition
			speech_recognizer.stop();
			speech_recognizer = null;
		}
		// Stop timer updating and rendering
		_this.stop_timer();
		// Play the stop sound
		done_sound.play();
		// Update the text of the start button
		$(".startButton").html('Restart');
		// Update highschore, if applicable
		if(highscore < score){
			_this.set_collection_highscore(score);
		}
		// Remove highlight classes
		$(".highlight").removeClass("highlight");
	}
}
