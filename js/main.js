function handleCredentialResponse(response) {
  const data = jwt_decode(response.credential)

  fullName.textContent = data.name
  picture.setAttribute("src", data.picture)
  //sub.textContent = data.sub
  //given_name.textContent = data.given_name
  //family_name.textContent = data.family_name
  //email.textContent = data.email
  //verifiedEmail.textContent = data.email_verified
  
}

window.onload = function () {
  //const clientID = window.prompt("Cole a sua Cliente ID", "")
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
    logo_alignment: "left",
  } // customization attributes
  );

  google.accounts.id.prompt(); // also display the One Tap dialog
}