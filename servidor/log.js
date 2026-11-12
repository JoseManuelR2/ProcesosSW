// Registro (log) de la actividad relevante del sistema.
// Escribe en la consola (con los emails enmascarados) y, si la CAD lo permite,
// lo persiste completo para la auditoría.
function enmascarar(texto){
    return texto.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@/g, "$1***@");
}

function Log(cad){
    this.cad = cad;

    this.registrar = async function(evento, datos){
        let entrada = {
            fecha: new Date().toISOString(),
            evento: evento,
            datos: datos || {}
        };
        console.log("[LOG] " + enmascarar(JSON.stringify(entrada)));
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

module.exports = { Log, enmascarar };
