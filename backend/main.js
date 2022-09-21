const { app, BrowserWindow, ipcMain ,dialog } = require('electron'); // electron
const isDev = require('electron-is-dev'); // To check if electron is in development mode
const path = require('path');
const fs = require('fs')
const fsa = require('fs/promises')
const sqlite= require('sqlite3');

let mainWindow,CourseWindow;

// Function To Check Whether The Data Is Taken At The Time Of Welcome Tour
const getMetadata=()=>{
  
  const metadataPath=path.join(app.getAppPath(),'./metadata.json')

  if(fs.existsSync(metadataPath)===false)
    return {takenTour:false};

    const jsonString=fs.readFileSync(metadataPath,'utf8')
    const metadata=JSON.parse(jsonString)

    return metadata;
}

// Initializing the Electron Window
const createWindow = () => {
  let metadata=getMetadata();
  
  const windowParameters = {
    width: metadata.isTourTaken ? 800 : 500 , 
    height: metadata.isTourTaken ? 600 : 300,
    frame:false,
    webPreferences: {
      preload: isDev 
        ? path.join(app.getAppPath(), './backend/preload.js')
        : path.join(app.getAppPath(), './build/preload.js'),
      worldSafeExecuteJavaScript: true,
      contextIsolation: true, 
    }
  }

  mainWindow = new BrowserWindow(windowParameters);

  mainWindow.loadURL(
    isDev
      ? metadata.isTourTaken ? 'http://localhost:3000/' : 'http://localhost:3000/WelcomeTour'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );
	
  //mainWindow.setIcon(path.join(__dirname, 'images/appicon.ico'));

  if (isDev) {
    mainWindow.webContents.on('did-frame-finish-load', () => {
      //mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
  }
};

// ((OPTIONAL)) Setting the location for the userdata folder created by an Electron app. It default to the AppData folder if you don't set it.
app.setPath(
  'userData',
  isDev
    ? path.join(process.resourcesPath/*app.getAppPath()*/, 'userdata/') // In development it creates the userdata folder where package.json is
    : path.join(process.resourcesPath, 'userdata/') // In production it creates userdata folder in the resources folder
);

// When the app is ready to load
app.whenReady().then(async () => {
  await createWindow(); // Create the mainWindow
});

// Exiting the app
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Activating the app
app.on('activate', () => {
  if (mainWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Logging any exceptions
process.on('uncaughtException', (error) => {
  console.log(`Exception: ${error}`);
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

//Database Connection And Instance
const database = new sqlite.Database(
    isDev
        ? path.join(path.join(app.getAppPath(),"database/database.sqlite"))
        : path.join(process.resourcesPath,"database/qwesda"),
    (err) => {
        if(err)
            console.log("Database Error");
        else
            console.log("Database Loaded");
    }
);

// Function To Minimize Window
ipcMain.handle("minimize",()=>{
    mainWindow.minimize()
})

// Function To Maximize Window
ipcMain.handle("maximize",()=>{
    if(mainWindow.isMaximized())
    {
        mainWindow.unmaximize()
    }
    else
    {
        mainWindow.maximize()
    }
})

ipcMain.handle("showDialog",(event,args)=>{
  let win = null;
  switch(args.window)
  {
    case "mainWindow" :
        win = mainWindow
        break;
    case "CourseWindow":
        win = CourseWindow
        break;
    default:
        break;
  }

  dialog.showMessageBox(win, args.options);
})
  
ipcMain.handle("saveFile",async (event,args)=>{
  let options = {

    title: "Save files",
    
    defaultPath : app.getPath("downloads"),
    
    buttonLabel : "Save Output File",

    properties: ['openDirectory']
  
   }

   let filename = await dialog.showOpenDialog(mainWindow, options)
   if(!filename.canceled)
   {
    var base64Data = args.replace(/^data:application\/pdf;base64,/, "");

    fs.writeFileSync(path.join(filename.filePaths[0],"/output.pdf"),base64Data,"base64")

    fs.copyFile("exam_paper__.tex", path.join(filename.filePaths[0],"/output.tex"), (err) => {
      if (err) {
        console.log("Error Found:", err);
      }
      else {
        console.log("\nFile Contents of copied_file::")
      }
    });
   }
})

// Function To Close Window
ipcMain.handle("close",(event,args)=>{
    switch(args)
    {
      case "mainWindow" :
          app.quit();
          break;
      case "CourseWindow":
          mainWindow.webContents.reloadIgnoringCache()
          CourseWindow.close()
          break;
      default:
          break;
    }
})


ipcMain.handle("createCourse",(event,args)=>{
  // insertCourseQuery to Insert Courese details into database 
  const insertCourseQuery='INSERT INTO course(course_code,course_name) VALUES(?,?)';

  let course_id;
  new Promise((resolve,reject)=>{
    database.run(insertCourseQuery,[args.code,args.name],
    function (error){
      if(error)
      {
        return reject(-1);
      }

      return resolve(this.lastID);
    }
      )
    }).then((result) => { 
      course_id=result;

    //insertCoQuery to insert Co details into database
      const insertCoQuery='INSERT INTO course_outcomes(course_outcomes_number,course_outcomes_description,course_id) VALUES(?,?,?)';
      const cos=args.co.map((value)=>value.value);
     
      cos.forEach((co,index)=>{
        database.run(insertCoQuery,[index+1,co,course_id],(error)=>{
          if(error)
          {
            console.log(error);
          }
          
        })
      });
      

    //insertUnit to insert Unit details into database
      const insertUnitQuery='INSERT INTO unit(unit_name,course_id) VALUES(?,?)';

      args.unit.forEach((value)=>{
        database.run(insertUnitQuery,[value.value,course_id],(error)=>{
          if(error)
          {
            console.log(error);
          }
          
      })
      });
    });
  return true
})

ipcMain.handle("getCourses",async ()=>{
//function returns JSON Object which contains list of courses
  const courses=[];
  
  const retriveQuery='SELECT * from course';

  return new Promise((resolve,reject)=>{
    
    database.each(retriveQuery,
      (error, row) => {
          
        if(error!=null)
            reject({statusCode:0,errorMessage:error});

        courses.push({"id":row.course_id,"code":row.course_code,"name":row.course_name});
        resolve({statusCode:1,courses:courses});
        })
    })

})


// Opens Update Course Window On Edit Button Of Course
ipcMain.handle("updateCourseWindow",(events,args)=>{

  CourseWindow = new BrowserWindow({
     parent: mainWindow,
     modal:true,
     height: 400,
     width: 600,
     frame:false,
     webPreferences: {
       preload: isDev 
         ? path.join(app.getAppPath(), './backend/preload.js')
         : path.join(app.getAppPath(), './build/preload.js'),
       worldSafeExecuteJavaScript: true,
       contextIsolation: true, 
     },
   });
   CourseWindow.setResizable(false)
   
   CourseWindow.loadURL( isDev
     ? `http://localhost:3000/updateCourse/?course_name=${args.name}&course_id=${args.id}&course_code=${args.code}`
     : `file://${path.join(__dirname, '../build/index.html')}` );
})


//Remove course from database
ipcMain.handle("removeCourse",async(event,args)=>{

  let status;
  const removeCourseQuery="DELETE FROM course WHERE course_id=?";
    new Promise((resolve,reject)=>
    {
      database.run(removeCourseQuery,[args],(error)=>{
        if(error!=null)
        {
          console.log(error);
          reject(false);
        }
        console.log('couse with course_id '+args+' removed succesfully');
        resolve(true);
      })
    }).then(
    function(res)
    {
      status=res;
    }
  );

  return status;
});

// Update Course function
ipcMain.handle("updateCourse",async(event,args)=>{

  const course_id=args.CourseID;
  const course_name=args.CourseName;
  const course_code=args.CourseCode;
  //update Query to updatecourse details
  const updateCourseQuery='UPDATE course SET course_code=? , course_name=? WHERE course_id=?'

  const status=new Promise((resolve,reject)=>{

    database.run(updateCourseQuery,[course_code,course_name,course_id],(error)=>{
      if(error)
      {
        console.log(error);
        reject(false);
      }
      console.log('course with course_id '+course_id+' updated successfully')
      resolve(true)
    })
  })
    return status;
});


//Used to insert College Metadata into database.
ipcMain.handle('setInstituteMetaData',(event,args)=>{

  if(args==null) return false;
    args=JSON.stringify(args)
    // console.log(args)
    fs.writeFileSync(path.join(app.getAppPath(),'./metadata.json'),args);
    
    const windowParameters = {
      width:  800 , 
      height: 600,
      frame:false,
      webPreferences: {
        preload: isDev 
          ? path.join(app.getAppPath(), './backend/preload.js')
          : path.join(app.getAppPath(), './build/preload.js'),
        worldSafeExecuteJavaScript: true,
        contextIsolation: true, 
      }
    }
  
    mainWindow = new BrowserWindow(windowParameters);
  
    mainWindow.loadURL(
      isDev
        ? 'http://localhost:3000/' 
        : `file://${path.join(__dirname, '../build/index.html')}`
    );
})

//Retrive units of perticuler course
ipcMain.handle("getUnits", (event,args)=>{

  const getUnitsQuery=`SELECT * FROM unit WHERE course_id='${args}'`
  const units=[]

  return new Promise((resolve,reject)=>{
    
    database.each(getUnitsQuery,
      (error, row) => {
          
        if(error!=null)
            reject({statusCode:0,errorMessage:error});

        units.push({"course_id":row.course_id,"unit_id":row.unit_id,"unit_name":row.unit_name});
        resolve({statusCode:1,units:units});
        })
    })
});

ipcMain.handle("s", (event,args)=>{

  const getUnitsQuery=`SELECT * FROM question WHERE course_id='${args}'`
  const questions=[]

  return new Promise((resolve,reject)=>{
    
    database.each(getUnitsQuery,
      (error, row) => {
          
        if(error!=null)
            reject({statusCode:0,errorMessage:error});

            
        questions.push({
          "question_id":row.question_id,
          "question_text":row.question_text,
          "question_type_id":row.question_type_id,
          "marks":row.marks,
          "taxonomy_id":row.taxonomy_id,
          "unit_id":row.unit_id,
          "question_image":row.question_image
        });
        resolve({statusCode:1,questions:questions});
        })
    })
});

//Retrive course_outcomes of perticuler course
ipcMain.handle("getCOs", (event,args)=>{

  const getCOsQuery=`SELECT * FROM course_outcomes WHERE course_id='${args}'`
  const cos=[]

  return new Promise((resolve,reject)=>{
    
    database.each(getCOsQuery,
      (error, row) => {
          
        if(error!=null)
            reject({statusCode:0,errorMessage:error});

        cos.push({
          "course_id":row.course_id,
          "course_outcomes_id":row.course_outcomes_id,
          "course_outcomes_description":row.course_outcomes_description,
          "course_outcomes_number":row.course_outcomes_number,
        });
        resolve({statusCode:1,cos:cos});
        })
    })
});

/** to insert question types
  
  insert into question_type(question_type_name) VALUES ("MCQ"),("SHORT"),("MEDIUM"),("LONG")

 */
//get Question Types
ipcMain.handle('getQuestionTypes',()=>{

  const getQuestionTypesQuery=`SELECT * FROM question_type `
  const question_types=[]

  return new Promise((resolve,reject)=>{
    
    database.each(getQuestionTypesQuery,
      (error, row) => {
          
        if(error!=null)
            reject({statusCode:0,errorMessage:error});

        question_types.push({
          "question_type_id":row.question_type_id,
          "question_type_name":row.question_type_name,
        });
        resolve({statusCode:1,question_types:question_types});
        })
    })
})

/** to insert Taxonomy
 
 INSERT INTO 
  taxonomy(taxonomy_name,taxonomy_letter) 
  VALUES ('Remember','R'),('Understand','U'),('Apply','A'),('Analyze','N'),('Evaluate','E'),('Create','C')
  
 */
//get Taxonomy
ipcMain.handle('getTaxonomy',()=>{

  const getTaxonomyQuery=`SELECT * FROM taxonomy`
  const taxonomy=[]
  const count = "SELECT count(*) FROM taxonomy"

  return new Promise((resolve,reject)=>{
    
    database.get(count, (error, row) => {
      if (error) 
        reject({statusCode:0,errorMessage:error});
      
      if(row['count(*)'] === 0)
        reject({statusCode:0,errorMessage:"No Rows"})
    })

    database.each(getTaxonomyQuery,
      (error, row) => {
        
        if(error)
            reject({statusCode:0,errorMessage:error});

        taxonomy.push({
          "taxonomy_id":row.taxonomy_id,
          "taxonomy_name":row.taxonomy_name,
          "taxonomy_letter":row.taxonomy_letter,
        });
        resolve({statusCode:1,taxonomy:taxonomy});
        })
    })
   
})

ipcMain.handle("openNewCourse",()=>{

   CourseWindow = new BrowserWindow({
      parent: mainWindow,
      modal:true,
      height: 400,
      width: 600,
      frame:false,
      webPreferences: {
        preload: isDev 
          ? path.join(app.getAppPath(), './backend/preload.js')
          : path.join(app.getAppPath(), './build/preload.js'),
        worldSafeExecuteJavaScript: true,
        contextIsolation: true, 
      },
    });

    CourseWindow.loadURL( isDev
      ? 'http://localhost:3000/createCourse'
      : `file://${path.join(__dirname, '../build/index.html')}` );
})

ipcMain.handle("openCourse",(event,args)=>{

  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000/Course?course_id='+args 
      : `file://${path.join(__dirname, '../build/index.html')}`
  );
})



ipcMain.handle("getCourseFromID",async (event,args)=>{
  //function returns JSON Object which contains list of courses
  
    const retriveQuery=`SELECT * from course where course_id='${args}'`;
  
    return new Promise((resolve,reject)=>{
      
      database.each(retriveQuery,
        (error, row) => {
            
          if(error!=null)
              reject({statusCode:0,errorMessage:error})
          
          resolve({"id":row.course_id,"code":row.course_code,"name":row.course_name})
          
        })
      })
  
  })


  ipcMain.handle("openAddQuestions",(event,args)=>{

    mainWindow.loadURL(
      isDev
        ? 'http://localhost:3000/AddQuestions?course_id='+args 
        : `file://${path.join(__dirname, '../build/index.html')}`
    );
  })


  ipcMain.handle("getFile",async (event,args)=>{
    console.log(path.join(app.getAppPath(),"/output/exam_paper__.pdf"))
    try {
      const data = await fsa.readFile(path.join(app.getAppPath(),"/output/exam_paper__.pdf"),{encoding:"base64"});
      return data
    } catch (err) {
      console.log(err);
    }
  })

  ipcMain.handle("openGenereatePaper",(event,args)=>{

    mainWindow.loadURL(
      isDev
        ? 'http://localhost:3000/GeneratePaper?course_id='+args 
        : `file://${path.join(__dirname, '../build/index.html')}`
    );
  })
  
  ipcMain.handle("goBack",()=>{
    mainWindow.webContents.goBack()
  })

  ipcMain.handle("generateTex", (event,args)=>{


    const MetaData = args.MetaData

    args = args.QuestionDetails

    let questionsCode = "";
  
    const headerCode=`
  %college Heading
  
  \\textbf{Birla Vishwakarma Mahavidhyalaya(Engineering College)} \\\\
  \\textbf{\\textit{(An Autonomous Institute)}} \\\\
  \\textbf{${MetaData.Year} Year, ${MetaData.Stream}} \\\\
  \\textbf{${MetaData.ExamType} ,${MetaData.Semester},AY ${MetaData.AY}} \\\\
  \\vspace{4mm}
  
  
  \\end{center}
  \\end{large}
  %Course code, title, maximum marks, date, time
  \\begin{large}
  \\textbf{Course Code: ${MetaData.CourseCode}}  
  \\hspace{20mm}
  \\textbf{Course Title: ${MetaData.CourseName}}\\vspace{2mm}\\\\
  \\textbf{Date:} 
  \\parbox[t]{37mm}{${MetaData.Date}}
  \\textbf{Time:}
  \\parbox[t]{37mm}{${MetaData.Time}}
  \\textbf{Maximum Marks: ${MetaData.TotalMarks}}
  \\end{large} \\\\
  \\rule{162mm}{0.3mm}
  \\textbf{Instruction}
  
  %instruction section
  
  \\begin{itemize}
      \\item Numbers in the square brackets to the right indicate maximum marks.
      ${MetaData.Instructions.map((value)=>{
        return ("\\item "+value.value)
      })}
      \\item The text just below marks indicates the Course Outcome Nos. (CO) followed by the Bloom’s taxonomy level of the question, i.e., R: Remember, U: Understand, A: Apply, N: Analyze,       E: Evaluate, C: Create
  \\end{itemize}
  \\rule{162mm}{0.3mm}
  `    
  
  questionsCode+='\\begin{questions}\n';
  questionsCode+='\\pointname{}\n';
  questionsCode+='\\pointsinrightmargin\n';
  questionsCode+='\\pointformat{\\parbox[t]{16pt}{\\text{[\\thepoints]}}}\n';
  
  
  args.forEach(question => {
    
    questionsCode+=`\\question[${question.text.marks}]\n`
      
    if(question.showText){//It has sub questions
  
        questionsCode+=`\\vspace{-\\baselineskip}\\vspace{1.5mm}${question.text.label}\n`
  
        questionsCode+='\\begin{parts}\n'
        question.subq.forEach(sub_q=>{
            questionsCode+=`\\part ${sub_q.label}\n`
        });
        questionsCode+='\\end{parts}\n'
    }
    else{ //It has no sub questions
  
        questionsCode+=`\\vspace{-\\baselineskip}\\vspace{1.5mm}${question.text.label}\n`
    }
  });
  
  questionsCode+='\\end{questions}\n'
  const examPaperCode=`\\documentclass[addpoints]{exam}
  \\usepackage[a4paper]{geometry}
  \\usepackage{amsmath,stackengine}
  \\begin{document}
  \\begin{large}        
  \\begin{center} `+
  
  headerCode +
  
  questionsCode +
  
  `\\end{document}`;
  
  fs.writeFileSync('./exam_paper__.tex',examPaperCode)

  const { exec } = require('child_process');
  
  exec('pdflatex --output-directory='+path.join(app.getAppPath(),'/output/')+' exam_paper__.tex', (err, stdout, stderr) => {
    if (err) {
      console.log(err)
      return;
    }

    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);
    
    mainWindow.loadURL(
      isDev
        ? 'http://localhost:3000/ShowPDF'
        : `file://${path.join(__dirname, '../build/index.html')}`
    );
  });

  
  })


  ipcMain.handle('insertQuestion',(event,args)=>{
    // console.log(args);
  
    const insertQuestionQuery="INSERT INTO question(question_text,question_type_id,marks,course_id,taxonomy_id,unit_id,question_image) VALUES (?,?,?,?,?,?,?)";
      let status;
     
    new Promise((resolve,reject)=>
    {
      database.run(insertQuestionQuery,[args.question_text,args.question_type_id,args.marks,args.course_id,args.taxonomy_id,args.unit_id,args.question_image],function (error){
        if(error)
        {
          return reject(-1);
        }
  
        return resolve(this.lastID);
      }
        )
      }).then((result) => {
        const question_id=result;
     
      //Insert into course_outcome_question_table
      const courseOutcomesList=args.cource_outcome_ids;
      const insertCOQuestionQuery="INSERT INTO course_outcomes_question(question_id,course_outcomes_id) VALUES(?,?)"
      courseOutcomesList.forEach(co=>{
        database.run(insertCOQuestionQuery,[question_id,co],(error)=>{
          if(error!=null){
            console.log(error)
          }
          status=true
        })
      });
   
      //insert options of question into database
      if(args.isMCQ)
      {
        const options=args.options;
        const insertOptionQuery="INSERT INTO mcq_option(question_id,option_text) VALUES(?,?)"
        options.forEach(option=>{
          database.run(insertOptionQuery,[question_id,option],(error)=>{
            if(error!=null){
              console.log(error)
            }
            status=true
          })
        });
      }
    }
  );
  
})


ipcMain.handle('getQuestions',(events,args)=>{

  const CourseID = args.course_id

  let sql = `SELECT * FROM question INNER JOIN taxonomy ON taxonomy.taxonomy_id = question.taxonomy_id INNER JOIN unit 
  ON unit.unit_id = question.unit_id AND question.course_id = `+CourseID
  
  return new Promise((resolve,reject)=>{
    
    database.all(sql,async (error,rows)=>{

      if(error) reject(error)
  
      const Questions = await Promise.all(rows.map(async (row)=>{
        
        sql = `SELECT course_outcomes_question.course_outcomes_id,course_outcomes.course_outcomes_description FROM course_outcomes_question INNER JOIN course_outcomes 
        ON course_outcomes_question.course_outcomes_id = course_outcomes.course_outcomes_id AND course_outcomes_question.question_id = `+row.question_id
          
        const CourseOutcomes = new Promise((resolve,reject)=>{
          database.all(sql,(error,rows)=>{
            if(error) reject(error)
            resolve(rows)
          })
        })

        await Promise.all([CourseOutcomes]).then((values)=>{
          row.cource_outcomes = values[0]
          
        })

        return row

      }))

      resolve(Questions)

    })
  })
  
})