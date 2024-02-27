function handleCredentialResponse(response) {
  const data = jwt_decode(response.credential)

  fullName.textContent = data.name
  picture.setAttribute("src", data.picture)
//   document.getElementById('botaoAvancar').style.display = 'inline';
}

window.onload = function () {
  const clientID = "762869086197-csvsm277peta409i3nt1s6c2qon45ns9.apps.googleusercontent.com"
//   document.getElementById('botaoAvancar').style.display = 'none';

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

  google.accounts.id.prompt();}



