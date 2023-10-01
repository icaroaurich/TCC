function handleCredentialResponse(response) {
  const data = jwt_decode(response.credential)

  fullName.textContent = data.name
  picture.setAttribute("src", data.picture)
}

window.onload = function () {
  const clientID = "762869086197-csvsm277peta409i3nt1s6c2qon45ns9.apps.googleusercontent.com"

  google.accounts.id.initialize({
    client_id: clientID,
    callback: handleCredentialResponse
  });

  google.accounts.id.renderButton(
    document.getElementById("buttonDiv"), {
    theme: "filled_black",
    size: "large",
    type: "standard",
    shape: "pill",
    locale: "pt-BR",
    });

  google.accounts.id.prompt();

  data = jwt_decode(response.credential)
  picture.setAttribute("src", data.picture)
  
}

function onSignIn(response) {
  // Conseguindo as informações do seu usuário:
    var perfil = response.getBasicProfile();
 
  // Conseguindo o ID do Usuário
    var userID = perfil.getId();
 
  // Conseguindo o Nome do Usuário
    var userName = perfil.getName();
 
  // Conseguindo o E-mail do Usuário
    var userEmail = perfil.getEmail();
 
  // Conseguindo a URL da Foto do Perfil
    var userPicture = perfil.getImageUrl();
 
  document.getElementById('picture').src = userPicture;
  document.getElementById('user-name').innerText = userName;
  document.getElementById('user-email').innerText = userEmail;
 
  // Recebendo o TOKEN que você usará nas demais requisições à API:
    var LoR = response.getAuthResponse().id_token;
    console.log("~ le Tolkien: " + LoR);
  };



