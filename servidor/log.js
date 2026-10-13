// Registro (log) de la actividad relevante del sistema.
// Escribe en la consola y, si la CAD lo permite, lo persiste.
function Log(cad){
    this.cad = cad;

    this.registrar = async function(evento, datos){
        let entrada = {
            fecha: new Date().toISOString(),
            evento: evento,
            datos: datos || {}
        };
        console.log("[LOG] " + JSON.stringify(entrada));
        if (this.cad && this.cad.registrarLog){
            try{
                await this.cad.registrarLog(entrada);
            }
            catch(e){
                console.error("No se pudo persistir el log: " + e.message);
            }
        }
    }
}

module.exports = { Log };
