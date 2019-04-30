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
      document.getElementsByClassName("card")[0].classList.toggle("flipped");
    })
  }
}

function setupModalClick(){
  //Fetch Resume buttons
  var resumeActions = document.getElementsByClassName("resume-link");

  //Apply actions
  for(var i = 0; i < resumeActions.length; i++){
    resumeActions[i].addEventListener("click", function(){
      $('#resume-modal').modal('show');
    })
  }

}
