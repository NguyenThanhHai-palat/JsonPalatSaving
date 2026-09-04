import express from "express";
import multer from "multer";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.use(express.json());
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "temp/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.post("/upload", upload.fields([{ name:"image1" }, { name:"image2" }]), async (req, res) => {
  console.log("SEND")
    try {
    console.log("SEND");

    const {
      pinlog, device_id, speed, geo, foundtruck, foundtruckback,
      angle, timestamp, trangthai, email, sdt
    } = req.body;

    if (!device_id)
      return res.status(400).json({ error: "Thiếu id thiết bị" });

    if (!req.files || !req.files.image1 || !req.files.image2) {
      return res.status(400).json({ error: "Thiếu ảnh upload" });
    }

    const uploadDir = path.join(__dirname, "upload", device_id);
    await fs.ensureDir(uploadDir);

    // Tạo file device.json nếu chưa có
    const deviceFile = path.join(uploadDir, "device.json");
    if (!(await fs.pathExists(deviceFile))) {
      await fs.writeJSON(deviceFile, {
        id_thietbi: device_id,
        ngay_tao: new Date().toISOString(),
        email: email || "",
        sdt: sdt || ""
      }, { spaces: 2 });
    }

    // Lưu image1
    const filename1 = `${Date.now()}_front.jpg`;
    const path1 = path.join(uploadDir, filename1);
    await fs.move(req.files.image1[0].path, path1, { overwrite: true });

    // Lưu image2
    const filename2 = `${Date.now()}_back.jpg`;
    const path2 = path.join(uploadDir, filename2);
    await fs.move(req.files.image2[0].path, path2, { overwrite: true });

    const imageUrl1 = `/upload/${device_id}/${filename1}`;
    const imageUrl2 = `/upload/${device_id}/${filename2}`;

    const jsonPath = path.join(uploadDir, "data.json");
    let dataArr = [];
    if (await fs.pathExists(jsonPath))
      dataArr = await fs.readJSON(jsonPath);

    dataArr.push({
      time_upload: new Date().toISOString(),
      url_front: imageUrl1,
      url_back: imageUrl2,
      deviceinf: { pinlog,speed, geo, foundtruck, foundtruckback, angle, timestamp, trangthai }
    });

    await fs.writeJSON(jsonPath, dataArr, { spaces: 2 });

    // Lưu log.json
    const logFile = path.join(uploadDir, "log.json");
    let logs = {};
    if (await fs.pathExists(logFile))
      logs = await fs.readJSON(logFile);

    const t = Date.now().toString();
    logs[t] = {
      speed, geo, foundtruck, foundtruckback,
      angle, timestamp, trangthai,
      imageUrl1, imageUrl2
    };

    await fs.writeJSON(logFile, logs, { spaces: 2 });

    res.json({
      success: true,
      message: "save ok",
      front: imageUrl1,
      back: imageUrl2
    });

  } catch (err) {
    console.error("/upload error:", err);
    res.status(500).json({ error: "Lỗi upload" });
  }
});
app.post("/stream", upload.fields([{ name: "image1", maxCount: 1 },{ name: "image2", maxCount: 1 }]), async (req, res) => {
  console.log("stream from device: "+req.body.device_id)
  try {
      const id_device = req.body.device_id;
      if (!id_device) {
        return res.status(400).json({ error: "Thiếu id_device" });
      }

      if (!req.files?.image1 || !req.files?.image2) {
        return res.status(400).json({ error: "Thiếu ảnh" });
      }

      const deviceDir = path.join(__dirname, "upload", id_device);
      await fs.ensureDir(deviceDir);

      // ====== SAVE IMAGE 1 ======
      await fs.move(
        req.files.image1[0].path,
        path.join(deviceDir, "stream.jpg"),
        { overwrite: true }
      );

      await fs.move(
        req.files.image2[0].path,
        path.join(deviceDir, "stream_back.jpg"),
        { overwrite: true }
      );

      const streamData = {
        speed: req.body.speed,
        truck: req.body.truck === "true",
        geo: req.body.geo,
        timestamp: req.body.timestamp,
        pinlog: req.body.pinlog,
        doimu: req.body.trangthai,
        trangthaixe: req.body.angle,
        updated_at: new Date().toISOString()
      };

      await fs.writeJson(
        path.join(deviceDir, "stream.json"),
        streamData,
        { spaces: 2 }
      );

      res.json({ success: true });
    } catch (err) {
      console.error("STREAM ERROR:", err);
      res.status(500).json({ error: "500" });
    }
  }
);
app.get("/getstreaminfo/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const deviceDir = path.join(__dirname, "upload", id);

    const img1 = path.join(deviceDir, "stream.jpg");
    const img2 = path.join(deviceDir, "stream_back.jpg");
    const jsonPath = path.join(deviceDir, "stream.json");

    if (!await fs.pathExists(jsonPath)) {
      return res.status(404).json({ error: "No stream data" });
    }

    const data = await fs.readJson(jsonPath);

    res.json({
      image_front: `/upload/${id}/stream.jpg`,
      image_back: `/upload/${id}/stream_back.jpg`,
      data
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "500" });
  }
});

app.get("/view/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).send("id_device_unknow");

  const imgPath = path.join(__dirname, "upload", id, "stream.jpg");
  if (await fs.pathExists(imgPath)) {
    res.sendFile(imgPath);
  } else {
    res.status(404).send("Device_Not_stream");
  }
});

app.get("/get/:id", async (req, res) => {
  const id = req.params.id;
  const jsonPath = path.join(__dirname, "upload", id, "data.json");
  if (!(await fs.pathExists(jsonPath)))
    return res.status(404).json({ error: "Not found ID "+id });

  const data = await fs.readJSON(jsonPath);
  res.json(data.map((x) => x.url));
});
app.post("/connect", async (req, res) => {
   console.log("Have check device",req.body)
   const {id_device} = req.body
   const {sdt} = req.body
    const jsonPath = path.join(__dirname, "upload", id_device, "device.json");
    if (!(await fs.pathExists(jsonPath))){
      return res.status(404).json({ error: "Unknown" });}
    else{
        const deviceData = await fs.readJson(jsonPath);

        if (deviceData.sdt == sdt) {
            return res.status(201).json({ status: "FOUND" });
        } else {
            return res.status(200).json({ status: "FAIL" });
        }
    }
   
   
});
app.post("/rstphone", async (req, res) => {
   console.log("Reset sdt ->",req.body)
   const {id_device} = req.body
   const {sdt} = req.body
   const {newsdt} = req.body
    const jsonPath = path.join(__dirname, "upload", id_device, "device.json");
    if (!(await fs.pathExists(jsonPath))){
      return res.status(404).json({ error: "Unknown" });}
    else{
        const deviceData = await fs.readJson(jsonPath);

        if (deviceData.sdt == sdt) {
            await fs.writeJSON(jsonPath, {
                id_thietbi: id_device,
                ngay_tao: new Date().toISOString(),
                email: "",
                sdt: newsdt || ""
              }, { spaces: 2 });
              return res.status(201).json({ status: "OK" });
        } else {
            return res.status(200).json({ status: "FAIL" });
        }
    }
   
   
});
app.get("/getdevice/:id", async (req, res) => {
  const id = req.params.id;
  console.log(id)
  const jsonPath = path.join(__dirname, "upload", id, "device.json");
  if (!(await fs.pathExists(jsonPath)))
    return res.status(404).json({ error: "Not found ID "+id });

  const data = await fs.readJSON(jsonPath);
  res.json(data);
});
app.get("/getdata/:id", async (req, res) => {
  const id = req.params.id;
  console.log(id)
  const jsonPath = path.join(__dirname, "upload", id, "data.json");
  if (!(await fs.pathExists(jsonPath)))
    return res.status(404).json({ error: "Not found ID "+id });

  const data = await fs.readJSON(jsonPath);
  res.json(data);
});
app.get("/getimg/:id", async (req, res) => {
  const id = req.params.id;

  const logPath = path.join(__dirname, "upload", id, "log.json");

  if (!(await fs.pathExists(logPath)))
    return res.status(404).json({ error: "Not found ID " + id });

  const logs = await fs.readJSON(logPath);

  const baseUrl = req.protocol + "://" + req.get("host");

  const result = {};
  for (let key of Object.keys(logs)) {
    result[key] = {
      ...logs[key],
      imageUrl: baseUrl + logs[key].imageUrl
    };
  }

  res.json(result);
});

app.post("/postlog", async (req, res) => {
  try {
    const {timestampdvc,  speed, geo, foundtruck, angle,device_id, email, sdt,trangthai } = req.body;
    console.log(device_id,req.body)
    if (!device_id) return res.status(400).json({ error: "Thiếu id thiết bị" });

    const uploadDir = path.join(__dirname, "upload", device_id);
    await fs.ensureDir(uploadDir);

    // Tạo device.json nếu chưa có
    const deviceFile = path.join(uploadDir, "device.json");
    if (!(await fs.pathExists(deviceFile))) {
      const deviceInfo = {
        id_thietbi: device_id,
        ngay_tao: new Date().toISOString(),
        email: email || "",
        sdt: sdt || ""
      };
      await fs.writeJSON(deviceFile, deviceInfo, { spaces: 2 });
    }

    const logFile = path.join(uploadDir, "log.json");
    let logs = {};
    if (await fs.pathExists(logFile)) logs = await fs.readJSON(logFile);


    const timestamp = Date.now().toString();

    logs[timestamp] = {
      speed,
      geo,
      foundtruck,
      angle,
      timestampdvc,
      trangthai
    };

    await fs.writeJSON(logFile, logs, { spaces: 2 });
    res.json({ success: true, message: "Đã lưu log", timestamp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi ghi log" });
  }
});

// Cho phép truy cập file ảnh trực tiếp
app.use("/upload", express.static(path.join(__dirname, "upload")));

app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
