// Capa de acceso a datos contra MongoDB (Mongoose).
// Expone la misma interfaz que cadMemoria.js: la capa lógica no cambia.
const mongoose = require("mongoose");

const usuarioSchema = new mongoose.Schema({
    email:    { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    rol:      { type: String, default: "usuario" },
    estado:   { type: String, default: "pendiente" }
}, { versionKey: false });

const logSchema = new mongoose.Schema({
    fecha:  { type: String },
    evento: { type: String },
    datos:  { type: Object }
}, { versionKey: false });

// Evita redefinir el modelo si el módulo se carga varias veces.
const Usuario = mongoose.models.Usuario || mongoose.model("Usuario", usuarioSchema);
const Log = mongoose.models.Log || mongoose.model("Log", logSchema);

function CadMongo(){
    this.conectar = async function(uri){
        await mongoose.connect(uri);
    };

    this.obtenerUsuario = async function(email){
        return await Usuario.findOne({ email: email }).lean();
    };

    this.obtenerUsuarios = async function(){
        return await Usuario.find({}).lean();
    };

    this.agregarUsuario = async function(usuario){
        await Usuario.create(usuario);
    };

    this.actualizarUsuario = async function(email, cambios){
        await Usuario.updateOne({ email: email }, { $set: cambios });
    };

    this.eliminarUsuario = async function(email){
        await Usuario.deleteOne({ email: email });
    };

    this.registrarLog = async function(entrada){
        await Log.create(entrada);
    };

    this.obtenerLogs = async function(){
        return await Log.find({}).sort({ _id: -1 }).limit(200).lean();
    };
}

module.exports = { CadMongo };
