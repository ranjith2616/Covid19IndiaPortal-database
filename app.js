const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dpPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializationServerAndDataBase = async () => {
  try {
    db = await open({
      filename: dpPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Running Server at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error ${e.message}`);
  }
};

initializationServerAndDataBase();

const convertDBObjIntoResponseObj = (dbObj) => {
  return {
    stateId: dbObj.state_id,
    stateName: dbObj.state_name,
    population: dbObj.population,
  };
};

const convertDistrictNames = (dbObj) => {
  return {
    districtId: dbObj.district_id,
    districtName: dbObj.district_name,
    stateId: dbObj.state_id,
    cases: dbObj.cases,
    cured: dbObj.cured,
    active: dbObj.active,
    deaths: dbObj.deaths,
  };
};

const logger = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  //console.log(jwtToken);
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "abc", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        //console.log("OK Ranjith");
        next();
      }
    });
  }
};

// API 1 Log In
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `
    SELECT * from user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "abc");

      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 2 GET Method Returns a list of all states in the state table
app.get("/states/", logger, async (request, response) => {
  const getStatesList = `
    SELECT * FROM state;
    `;
  const stateList = await db.all(getStatesList);
  response.send(stateList.map((each) => convertDBObjIntoResponseObj(each)));
});

// API 3 GET Method Returns a state based on the state ID
app.get("/states/:stateId/", logger, async (request, response) => {
  const { stateId } = request.params;
  const getStateNameQuery = `
  SELECT * FROM state WHERE state_id = '${stateId}';
  `;
  let dbResponse = await db.get(getStateNameQuery);
  response.send(convertDBObjIntoResponseObj(dbResponse));
});

// API 4 POST Method Create a district in the district table, district_id is auto-incremented
app.post("/districts/", logger, async (request, response) => {
  const newDistrictDet = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = newDistrictDet;

  const postQuery = `
  INSERT INTO
  district (district_name, state_id, cases, cured, active, deaths)
  VALUES (
      '${districtName}',
      '${stateId}',
      '${cases}',
      '${cured}',
      '${active}',
      '${deaths}');`;

  let dbResponse = await db.run(postQuery);
  response.send("District Successfully Added");
});

// API 5 GET Returns a district based on the district ID
app.get("/districts/:districtId/", logger, async (request, response) => {
  const { districtId } = request.params;

  const getDistrictBasedOnID = `
    SELECT * FROM district WHERE district_id = '${districtId}';
    `;
  const dbResponse = await db.get(getDistrictBasedOnID);
  response.send(convertDistrictNames(dbResponse));
});

// API 6 Deletes a district from the district table based on the district ID
app.delete("/districts/:districtId/", logger, async (request, response) => {
  const { districtId } = request.params;

  const deleteQuery = `
    DELETE FROM district WHERE district_id = '${districtId}';
    `;
  await db.run(deleteQuery);
  response.send("District Removed");
});

// API 7 GET Method Returns an object containing the state name of a district based on the district ID
app.get(
  "/districts/:districtId/details/",
  logger,
  async (request, response) => {
    const { districtId } = request.params;

    const stateIdQuery = `
    SELECT * from district WHERE district_id = '${districtId}';
    `;
    let dbResponse = await db.get(stateIdQuery);
    let stateId = dbResponse.state_id;

    let stateName = `
  SELECT state_name FROM state WHERE state_id = '${stateId}'
  `;
    let dbResponse2 = await db.get(stateName);
    response.send(convertDBObjIntoResponseObj(dbResponse2));
  }
);

// API 8 Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
app.get("/states/:stateId/stats/", logger, async (request, response) => {
  const { stateId } = request.params;

  const getStatistics = `
    SELECT 
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
    FROM district
    WHERE state_id = ${stateId};
    `;
  let dbResponse = await db.get(getStatistics);
  console.log(dbResponse);
  response.send({
    totalCases: dbResponse["SUM(cases)"],
    totalCured: dbResponse["SUM(cured)"],
    totalActive: dbResponse["SUM(active)"],
    totalDeaths: dbResponse["SUM(deaths)"],
  });
});

module.exports = app;
