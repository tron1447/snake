const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req,res)=>{

    let filePath =
        req.url === "/"
        ? path.join(__dirname,"index.html")
        : path.join(
            __dirname,
            req.url
        );

    if(!fs.existsSync(filePath)){

        res.writeHead(404);

        res.end("Not found");

        return;
    }

    const ext =
        path.extname(filePath);

    const types={

        ".html":
            "text/html; charset=utf-8",

        ".js":
            "application/javascript",

        ".css":
            "text/css",

        ".json":
            "application/json"

    };

    res.writeHead(
        200,
        {
            "Content-Type":
                types[ext] ||
                "text/plain"
        }
    );

    fs.createReadStream(
        filePath
    ).pipe(res);

});


const wss =
    new WebSocket.Server({
        server
    });


const players =
    new Map();


function makeId(){

    return Math.random()
        .toString(36)
        .substring(2,10);

}


wss.on(
    "connection",
    ws=>{

        const id=makeId();

        players.set(
            id,
            {
                x:10000,
                y:10000,
                angle:0,
                length:20,
                color:"#42a5ff",
                name:"Player"
            }
        );


        ws.on(
            "message",
            message=>{

                try{

                    const data=
                        JSON.parse(
                            message.toString()
                        );


                    if(
                        data.type==="state"
                    ){

                        const p=
                            players.get(id);

                        if(!p)
                            return;


                        /*
                           Kontrollime, et mängija
                           ei saadaks serverile
                           täiesti ebamõistlikke väärtusi.
                        */

                        if(
                            Number.isFinite(data.x)
                        )
                            p.x=data.x;

                        if(
                            Number.isFinite(data.y)
                        )
                            p.y=data.y;

                        if(
                            Number.isFinite(data.angle)
                        )
                            p.angle=data.angle;

                        if(
                            Number.isFinite(data.length)
                        )
                            p.length=data.length;

                        if(
                            typeof data.color==="string"
                        )
                            p.color=data.color;

                        if(
                            typeof data.name==="string"
                        )
                            p.name=
                                data.name
                                .substring(0,16);

                    }

                }catch(err){

                    console.log(
                        "Message error:",
                        err.message
                    );

                }

            }
        );


        ws.on(
            "close",
            ()=>{

                players.delete(id);

            }
        );


        ws.on(
            "error",
            ()=>{

                players.delete(id);

            }
        );

    }
);


/*
   Saadame kõikidele ühendatud mängijatele
   teiste mängijate asukohad.
*/

setInterval(()=>{

    const list={};

    for(
        const [id,p]
        of players
    ){

        list[id]=p;

    }


    const message=
        JSON.stringify({

            type:"players",

            players:list

        });


    for(
        const ws
        of wss.clients
    ){

        if(
            ws.readyState ===
            WebSocket.OPEN
        ){

            ws.send(message);

        }

    }

},100);


server.listen(
    PORT,
    ()=>{
        console.log(
            `Snake server running on port ${PORT}`
        );
    }
);
