var SpeechRecognition = window.mozSpeechRecognition ||
	window.msSpeechRecognition ||
	window.oSpeechRecognition ||
	window.webkitSpeechRecognition ||
	window.SpeechRecognition;


function Talk2LearnApplication(){
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

	// Current language to use in speech recognition
	var speech_language = 'nl-NL';

	this.init = function(collections_api){
		$.get(collections_api, function(data){
			for(var i = 0; i < data.length; i++){
				// Save a mapping from each collection's id to it's parameters.
				collections[data[i]['id']] = data[i];
				// Add collection to collection selector
				_this.render_collection_option(data[i]);
			}
		})
	}

	// Display a new collection in the collection selector
	this.render_collection_option = function(collection){
		$("#categoryList").append(
			$("<li>")
				.addClass("category")
				.html(collection['title'])
				.on("click", function(){
					_this.select_collection(collection['id'], this);
				}));
	}

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
		// Load the first card from the new selected collection
		_this.select_next_card()
	}

	// Retrieve a new card from the selected collection
	this.select_next_card = function(){
		$.get(selected_collection.card, function(data){
			if(current_card == data){
				// If the new card is already displayed, request a new one.
				_this.select_next_card();
			} else {
				current_card = data;
				_this.display_card(data)
			}
		}
	}

	// Display a card's question
	this.display_card = function(card){
		$("#problem").html(card['question'])
	}

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
	}

	// Set language to use in speech recognition
	this.set_language = function(lang){
		speech_language = lang;
	}
}


var currentProblem;
var currentScore = 0;
var highScore = 0;
var timerCtx = document.getElementById('cnvTimer').getContext('2d');
var timerCanvasHeight = document.getElementById('cnvTimer').height;
var beginTime;
var errorOccurred = false;
var selectedCategory = 'builtin-addition';
var problemsForSelectedCategory;
//var selectedLanguage = navigator.language;
var selectedLanguage = 'nl-NL'

function selectLanguage(newValue) {
	var dropdown = document.getElementsByClassName('languageSelector')[0];
    for(var i = 0; i < dropdown.options.length; i++) {
        if(dropdown.options[i].value === newValue) {
           dropdown.selectedIndex = i;
           return;
        }
    }

    if (newValue.length === 2) {
		for(i = 0; i < dropdown.options.length; i++) {
			if(dropdown.options[i].value.substring(0, 2) === newValue) {
				dropdown.selectedIndex = i;
				return;
			}
		}
    }

    // Default to US english if not found
    selectedLanguage = 'en-US';
    selectLanguage(selectedLanguage);
}

function showNextProblem() {
	$.get(selectedCategory.card, function(data){
		if(currentProblem == data){
			showNextProblem();
		}else{
			currentProblem = data;
			$("#problem").html(data['question']);
		}
	})
}

function startSpeechRecognition() {
	var currentTime = 60;
	var timer;
	var speech = new SpeechRecognition();
	speech.continuous = true;
	speech.interimResults = true;
	speech.lang = selectedLanguage;
	speech.onstart = function() {
		// Run for 60 seconds and stop
		setTimeout(function() {
			speech.stop();
		}, 60000);

		document.getElementsByClassName('scores')[0].classList.remove('hidden');
		document.getElementsByClassName('card')[0].classList.remove('hidden');
		document.getElementsByClassName('iHeard')[0].classList.remove('hidden');
		document.getElementById('secondInstructions').style.display = '';

		errorOccurred = false;
		currentScore = 0;
		document.getElementById('currentScoreValue').textContent = currentScore;
		beginTime = new Date().getTime();
		window.requestAnimationFrame(updateTimer);

		var timeRemaining = document.getElementsByClassName('timeRemaining')[0];
		timeRemaining.textContent = '1:00';
		timeRemaining.classList.remove('expired');

		timer = setInterval(function() {
			var timeToShow = '';
			if (currentTime > 59) {
				timeToShow = '1:00';
			}
			if (currentTime < 10) {
				timeToShow = '0:0' + currentTime;
			}
			else {
				timeToShow = '0:' + currentTime;
			}

			currentTime--;

			timeRemaining.textContent = timeToShow;
		}, 1000);

		// Show the first question
		showNextProblem();
	};


	speech.onend = function() {
		currentTime = 60;
		clearInterval(timer);
		var timeRemaining = document.getElementsByClassName('timeRemaining')[0];
		timeRemaining.textContent = '1:00';
		timeRemaining.classList.add('expired');
		doneSound.play();
		errorOccurred = true;
		startButton.textContent = 'Restart';

		var previousHigh = common.getHighScoreFor(selectedCategory);
		if (previousHigh < currentScore) {
			common.setHighScoreFor(selectedCategory, currentScore);
			common.renderCategories();
			document.getElementById('highScoreValue').innerHTML = currentScore;
		}

		var highlighted = document.getElementsByClassName('highlight');
		for (var i = 0; i < highlighted.length; i++) {
			highlighted[i].classList.remove('highlight');
		}
	};

	speech.onerror = speech.onend;

	speech.onresult = function(event) {
		var iHeard = '';

		for (var i = event.resultIndex; i < event.results.length; i++) {
			if (!event.results[i].isFinal) {
				iHeard += event.results[i][0].transcript;
			}
		}
		setIHeardText(iHeard);
		checkAnswer(iHeard);
	};

	speech.start();
}

function checkAnswer(guess) {
	var trimmedGuess = guess.trim().toLowerCase();
	if (trimmedGuess.indexOf('stop') >= 0){
		showNextProblem();
		return;
	}

	$.post(currentProblem.check, {'answer': trimmedGuess}, function(){
		$("#currentScoreValue").html(++currentScore);

		if (currentScore > highScore) {
			$("#currentScoreValue").addClass('highlight');
		}

		showNextProblem();
	})
}

function setIHeardText(textToDisplay) {
	document.getElementById('iHeardText').textContent = textToDisplay;
}

function paintTimer(percent) {
	timerCtx.clearRect(0, 0, 1000, 1000);
	var radiusToUse = (timerCanvasHeight / 2) - 5;
	var grd = timerCtx.createRadialGradient(radiusToUse + 5,radiusToUse + 5, (radiusToUse - 15), radiusToUse - 5, radiusToUse - 5,(radiusToUse) + 10);
	grd.addColorStop(0,'rgb(' + Math.ceil(255 - (255 * percent)) + ', ' + Math.ceil(255 * percent) + ', 0)');
	grd.addColorStop(1,"black");

	// Fill with gradient
	timerCtx.fillStyle = grd;
	timerCtx.lineWidth = 4;
	timerCtx.beginPath();
	timerCtx.arc(radiusToUse + 5, radiusToUse + 5, radiusToUse, Math.PI * 3 / 2, Math.PI * 2 * percent - (Math.PI / 2), false);
	timerCtx.lineTo(radiusToUse + 5, radiusToUse + 5);
	timerCtx.closePath();
	timerCtx.stroke();
	timerCtx.fill();
}

function updateTimer() {
	if (errorOccurred) {
		return;
	}

	var now = new Date().getTime();
	var percent = (now - beginTime) / 60000;
	paintTimer(1 - percent);
	if (percent < 1) {
		window.requestAnimationFrame(updateTimer);
	}
}

function detectIfSpeechSupported() {
	var supportMessage;
	var warningsElement = document.getElementsByClassName('warnings')[0];
	if (SpeechRecognition) {
		supportMessage = "Cool!  Your browser supports speech recognition.  Have fun!";
	}
	else {
		warningsElement.classList.add('unsupported');
		supportMessage = "Sorry... Your browser doesn't support speech recognition yet.  Try Google Chrome version 25.";
	}
	warningsElement.innerHTML = supportMessage;
}

function switchToSecondInstructions() {
	var first = document.getElementById('firstInstructions');
	if (first.style.display !== 'none') {
		document.getElementById('secondInstructions').style.display = 'block';
		first.style.display = 'none';
	}
}

detectIfSpeechSupported();
common.renderCategories();
paintTimer(0.99999);
selectLanguage(selectedLanguage);

setTimeout(function() {
	document.getElementsByClassName('leftArrow')[0].style['margin-left'] ='0';
	setTimeout(function() {
		document.getElementsByClassName('leftArrow')[0].style['opacity'] ='0';
		document.getElementById('categoryComponent').style['box-shadow'] ='0 0 0 rgb(0, 115, 121)';
	}, 1500);
}, 300);

var startButton = document.getElementsByClassName('startButton')[0];
startButton.addEventListener('click', function() {
	if (this.classList.contains('disabled')) {
		window.alert('Please choose a category');
		return ;
	}

	startSpeechRecognition();
});

var languageSelector = document.getElementsByClassName('languageSelector')[0];
languageSelector.addEventListener('change', function() {
	selectedLanguage = languageSelector.options[languageSelector.selectedIndex].value;
});
