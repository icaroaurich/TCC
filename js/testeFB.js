document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("meuBotao1").addEventListener("click", function () {
        loginFacebook();
    });
});
document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("meuBotao2").addEventListener("click", function () {
        teste();
    });
});

function loginFacebook() {
    FB.login(function (response) {
        if (response.authResponse) {
            console.log('Welcome!  Fetching your information.... ');
            FB.api('/me', function (response) {
                console.log('Good to see you, ' + response.name + '.');
            });
        } else {
            console.log('User cancelled login or did not fully authorize.');
        }
    });
}
function teste(){
    FB.ui({
        method: 'share',
        href: 'https://developers.facebook.com/docs/'
      }, function(response){});
}
function checarLogin(){
    FB.getLoginStatus(function(response) {
        statusChangeCallback(response);
    });
}
function loginStatus(){
    FB.getLoginStatus(function(response) {
        if (response.status === 'connected') {
          var accessToken = response.authResponse.accessToken;
        } 
      } );
}
window.fbAsyncInit = function () {
    FB.init({
        appId: '1552182828658355',
        xfbml: true,
        version: 'v19.0'
    });
};
