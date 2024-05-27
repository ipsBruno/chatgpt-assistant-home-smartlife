const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const { tuyaApi } = require("tuya-cloud-api");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const OpenAI = require("openai");
const openai = new OpenAI();
const fs = require("fs");
require("dotenv").config();

var devicesId = [];
var chatObj = {
  model: "gpt-4-turbo",
  max_tokens: 2000,
  temperature: 0.6,
  messages: [],
  functions: [
    {
      name: "mudarEstado",
      description:
        "mudarEstado atualizará o estado de um dispositivo doméstico",
      parameters: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            description: "a lista de ids do dispositivo doméstico",
            items: {
              type: "string",
            },
          },
          state: {
            type: "boolean",
            description: "o novo estado do dispositivo doméstico true ou false",
          },
          unit: { type: "string" },
        },
        required: ["ids", "state"],
      },
      function: async ({ ids, state }) => {
        await mudarEstado(ids, state);
        return true;
      },
    },
  ],
  function_call: "auto",
};

const promptContent = fs
  .readFileSync(process.env.PROMPT_PATH || "prompt.txt")
  .toString();

function ConfigureChatGptSystem() {
  let gptSystem = promptContent + JSON.stringify(devicesId);
  chatObj.messages.push({
    role: "system",
    content: gptSystem,
  });
  console.log(chatObj);
  return;
}

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

wss.on("connection", (ws) => {
  ws.on("message", async (data) => {
    let usuarioEntrada = data.toString();
    console.log("Mensagem recebida do usuário: ", usuarioEntrada);

    var chatGpt = await getChatResponse(usuarioEntrada);

    ws.send(chatGpt);
  });

  ws.on("close", () => {});
});

async function inicializarWebSocket() {
  const PORT = 3000;
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

async function getChatResponse(mensagem) {
  try {
    console.log(mensagem);

    chatObj.messages.push({ role: "user", content: mensagem });

    try {
      var completion = await openai.chat.completions.create(chatObj);
      console.log;
      if (
        completion.choices[0].message &&
        completion.choices[0].message.function_call
      ) {
        var idObj = JSON.parse(
          completion.choices[0].message.function_call.arguments
        );
        mudarEstado(idObj.ids, idObj.state);
        console.log(idObj.ids, idObj.state);
      }
    } catch (e) {
      console.log("Sem função chamada", e);
    }
    try {
      var msg = completion.choices[0].message.content;
      chatObj.messages.push({ role: "assistant", content: msg });
      console.log("Resposta ChatGPT: ", completion.choices[0].message.content);
    } catch (e) {
      console.log(e, "Sem resposta do ChatGPT");
    }
    return msg;
  } catch (error) {
    console.log("Erro ao buscar resposta do ChatGPT", error);
    return false;
  }
}

let tuyaUser = {
  client_id: "YOUR CLIENT ID",
  secret: "YOUR SECRET ID",
  uuid: "YOUR UIID",
};

tuyaApi.authorize({
  apiClientId: tuyaUser.client_id,
  apiClientSecret: tuyaUser.secret,
  serverLocation: "us",
});

tuyaApi
  .getDeviceList({ uid: tuyaUser.uuid })
  .then((deviceList) => {
    for (var i in deviceList) {
      devicesId.push({ id: deviceList[i].id, name: deviceList[i].name });
    }
    mainer();
  })
  .catch((e) => {
    console.log("Erro ao buscar dispositivos", e);
  });

async function mudarEstado(devicesId, value) {
  for (var i = 1; i <= 6; i++) {
    for (var j = 0; j < devicesId.length; j++) {
      try {
        mudarEstadoInterruptor(devicesId[j], "switch_" + i, value);
        console.log("Mudou o estado do interruptor " + devicesId[j], i, value);
      } catch (e) {
        console.log("Erro ao mudar o estado do interruptor " + devicesId[j], e);
      }
    }
  }
}

async function mudarEstadoInterruptor(deviceId, code, value) {
  try {
    tuyaApi
      .sendCommand({
        deviceId,
        commands: [
          {
            code,
            value,
          },
        ],
      })
      .then((response) => {
        console.log("Mudou o estado do interruptor " + deviceId, code, value);
      })
      .catch((e) => {
        console.log("Erro ao mudar o estado do interruptor " + deviceId, e);
      });
  } catch (e) {
    console.log("mudarEstadoInterruptor", e);
  }
}

async function mainer() {
  console.log("Inicialiando ChatGPT2SmartLifeTuya");
  console.log("Dispositivos encontrados: ", devicesId.length);

  ConfigureChatGptSystem();
  inicializarWebSocket();
}
