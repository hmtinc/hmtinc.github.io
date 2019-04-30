setupTippy();
setupCardFlip();
setupModalClick();



function setupTippy() {
  //Fetch all buttons 
  var linkButtons = document.getElementsByClassName("display-tippy");

  //Setup up tooltip for each button
  for (var i = 0; i < linkButtons.length; i++) {

    //Fetch attributes 
    var button = linkButtons[i];
    var id = "#" + button.getAttribute("id");
    var tippyValue = button.getAttribute("value");
    var tippyPos = button.getAttribute("tippy-pos");

    //Set default
    if(!tippyPos){
      tippyPos = "bottom";
    }

    //Initialize Tippy
    tippy(id, {
      content: tippyValue,
      animation: 'scale',
      duration: 0,
      arrow: true,
      animation: 'fade',
      placement: tippyPos
    })
  }
}

function setupCardFlip(){
  //Fetch flip elements
  var actionButtons = document.getElementsByClassName("flip-action");

  //Apply actions
  for(var i = 0; i < actionButtons.length; i++){
    actionButtons[i].addEventListener("click", function(){
      document.getElementsByClassName("flipable-card")[0].classList.toggle("flipped");
    })
  }
}

function setupModalClick(){
  //Fetch modal buttons
  var modalActions = document.getElementsByClassName("modal-link");

  for(var i = 0; i < modalActions.length; i++){
    //Fetch Id
    var modalId = "#" + modalActions[i].getAttribute("value");

    //Setup click action
    modalActions[i].modalId = modalId;
    modalActions[i].addEventListener("click", function(evt){
      $(evt.target.modalId).modal('show');
    }, false);
  }

}
