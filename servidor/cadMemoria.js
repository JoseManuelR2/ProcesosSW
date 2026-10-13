// Implementación en memoria de la capa de acceso a datos (CAD).
// Se usa en las pruebas unitarias y como respaldo cuando no hay una base de
// datos configurada. Implementa exactamente la misma interfaz que la CAD real,
// de modo que la capa lógica no necesita cambios al cambiar de implementación.
function CadMemoria(){
    this.usuarios = {};
    this.logs = [];

    this.obtenerUsuario = async function(email){
        return this.usuarios[email] || null;
    };

    this.obtenerUsuarios = async function(){
        return Object.values(this.usuarios);
    };

    this.agregarUsuario = async function(usuario){
        this.usuarios[usuario.email] = Object.assign({}, usuario);
    };

    this.actualizarUsuario = async function(email, cambios){
        if (this.usuarios[email]){
            Object.assign(this.usuarios[email], cambios);
        }
    };

    this.eliminarUsuario = async function(email){
        delete this.usuarios[email];
    };

    this.registrarLog = async function(entrada){
        this.logs.push(entrada);
    };

    this.obtenerLogs = async function(){
        return this.logs.slice().reverse();
    };
}

module.exports = { CadMemoria };
