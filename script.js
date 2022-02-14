const express = require ("express")
const BodyParser = require("body-parser")
const cors = require('cors')
const knex =require("knex")
const bcrypt = require('bcryptjs')
const multer = require('multer')
const AWS = require('aws-sdk')
const uuid = require('uuid').v4
const https = require('https'); // or 'https' for https:// URLs
const fs = require('fs');
const path = require("path")
require('dotenv').config()


const database = knex({
    client: 'pg',
    // version: '15.1',
    
    connection: {  
        host : process.env.HOST,
        user : "postgres",
        password : "postgres",
        database : process.env.DATABASE,
        timezone: 'utc'
}
  });  

//   const pg = require('knex')({
//   client: 'pg',
//   connection: process.env.PG_CONNECTION_STRING,
//   searchPath: ['knex', 'public'],
// });


const app = express()

app.use(BodyParser.json())
app.use(BodyParser.urlencoded({ extended: false }))

app.use(cors())

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ID,
    secretAccessKey: process.env.AWS_SECRET,
    acl: "public-read",
})

var maxSize = 200 * 1024 * 1024;

const storage = multer.memoryStorage({
    destination: function(req, file, callback) {
        callback(null, '')
    }
    
})

const upload = multer({
    storage: storage,
    limits: { fileSize: maxSize }
}).single('image')

app.get('/' , (req , res) =>  {
    res.send("its working")
})

app.post('/register',(req,res) =>{
    const{email, name ,password} = req.body
    if (!email || !name || !password) {
        return res.status(400).json("incorrect form submission")
    }
    const hash = bcrypt.hashSync(password)
    database.transaction(trx =>{
        trx.insert({
            name:name,
            password:hash,
            email:email
        })
        .into('aws') 
            .then(() =>{ 
                res.status(200).json("success")
                })
        .then(trx.commit)
        .catch(trx.rollback)
    })
        .catch(err => res.status(400).json(err))
    
})

app.post ('/signin', (req,res) => {
    const{email ,password} = req.body
    if (!email  || !password) {
        return res.status(400).json("incorrect form submission")
    }
  database.select('email' , "password")
  .from('aws')
  .where('email' , "=" , email)
  .then(data =>{
    const isValid = bcrypt.compareSync(password , data[0].password)
    if (isValid) {
       return database.select('*').from ('aws')
        .where('email', '=', email)
        
        .then(user =>{
            res.status(200).json(user[0])
        })
        .catch(err => res.status(400).json("unable to connect"))
    }else{
        res.status(400).json("Wrong credentials")
    }
  })
 
      
  
  .catch(err => res.status(400).json("Wrong credentials"))
})

app.post('/upload',upload,(req, res) => {
    const{name , email} = req.body
    let myFile = req.file.originalname.split(".")
    const fileType = myFile[myFile.length - 1]

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        ContentType: '*',
        ACL:'public-read',
        Key: `${uuid()}.${fileType}`,
        Body: req.file.buffer
    }

    s3.upload(params, (error, data) => {
        if(error){
            res.status(500).send("file is too large")
        } else {
            database.transaction(trx =>{
        trx.insert({
            name:name,
            url:data.Location,
            email:email
        })
        .into('data') 
            .then(() =>{ 
                res.status(200).json("success")
                })
        .then(trx.commit)
        .catch(trx.rollback)
    })
        }
         
    })
})

app.get('/download', function (req, res) {
    const { email } = req.body;
    database.select('url').from('data').where('email', '=', email)
         .then(user => {
            database.select('foldername').from('data').where('email', '=', email)
                .then((name) => {
                    const url = (user[0].url)
                    const directory = (path.join(__dirname, '../../'))
                    const filename = path.basename(url)
                    if (name[0].foldername != "") {
                        
                        https.get(url, (res) => {
                            // Image will be stored at this path
                            const filePath = fs.createWriteStream(`${directory}/downloads/${name[0].foldername}/${filename}`);
                            res.pipe(filePath);
                            filePath.on('finish', () => {
                                filePath.close();
                                console.log('Download Completed1');
                              
                            })
                            
                        })
                           
                    }
                else {
                                 const location2 = `${directory}downloads/${filename}`;
                                 https.get(url, (res) => {
                              // Image will be stored at this path
             
                              const filePath = fs.createWriteStream(location2);
                              res.pipe(filePath);
                              filePath.on('finish', () => {
                                  filePath.close();
                                  res.status(200).json("success")
                                  console.log('Download Completed2');
                              })
                          })
                             }
                 res.status(200).json("success")
              
                     
        })
            .catch((error)=>{res.status(400).json(error) })
          
      })
    .catch((error) => { res.status(400).json(error) })
    
    
})

app.post("/makefolder", (req, res) => {
    const { email, foldername } = req.body;
    
    database('data')
    .where("email", "=", email)
    .then(() => {
      database('data')
    .where("email", "=", email)
    .update({
     foldername : foldername
  }).then(() =>{ 
    const directory = (path.join(__dirname, '../../'))
    const paths = `${directory}/downloads/${foldername}`;
              // Creates /tmp/a/apple, regardless of whether `/tmp` and /tmp/a exist.
          fs.mkdir(paths, { recursive: true }, (err) => {  
                if (err) throw err;
                })
          
    res.status(200).json("user")
    }) 
    .catch(err=> res.status(400).json("error"))
    })
    .catch(err=> res.status(400).json("invalid email address"))
    
})





app.listen(4000 ,() =>{console.log("running on port 4000")})