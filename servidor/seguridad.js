// Capa de seguridad: hash de contraseñas.
// Usamos bcryptjs (implementación pura en JavaScript de bcrypt): no necesita
// compilación nativa y es portable entre entornos.
const bcrypt = require("bcryptjs");

const RONDAS = 10;

function hashear(password){
    return bcrypt.hash(password, RONDAS);
}

function verificar(password, hash){
    return bcrypt.compare(password, hash);
}

module.exports = { hashear, verificar };
