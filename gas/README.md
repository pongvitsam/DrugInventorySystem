# ฐานข้อมูล Google Apps Script (GAS)

ใช้ Google Spreadsheet เป็นฐานข้อมูลกลาง — ทุกเครื่องที่เปิดเว็บและตั้ง URL เดียวกันจะ sync ข้อมูลร่วมกัน

## ขั้นตอนติดตั้ง (ครั้งเดียว)

### 1. สร้าง Apps Script project

1. เปิด [Google Apps Script](https://script.google.com/)
2. สร้างโปรเจกต์ใหม่
3. คัดลอกเนื้อหาจากไฟล์ `gas/Code.gs` ใน repo นี้ไปวางใน `Code.gs`
4. บันทึก (Ctrl+S)

### 2. สร้าง Spreadsheet

1. ใน Apps Script เลือกฟังก์ชัน `setupSpreadsheet_` แล้วกด **Run**
2. อนุญาตสิทธิ์เมื่อถูกถาม (Google Drive + Sheets)
3. เปิด **View → Logs** จะเห็น Spreadsheet ID และ URL
4. Script จะบันทึก `SPREADSHEET_ID` ใน Script Properties อัตโนมัติ

### 3. Deploy Web App

**สำคัญ:** clasp อัปโหลดโค้ดได้ แต่ต้อง deploy Web App ในเบราว์เซอร์ครั้งแรก:

1. เปิด Script Editor จาก `gas/DEPLOY.md` (Script ID ในไฟล์นั้น)
2. **Deploy → New deployment → Web app**
3. Execute as: **Me** · Who has access: **Anyone**
4. คัดลอก URL `/exec`

หรือใช้ clasp จากโฟลเดอร์ `gas/`:

```powershell
clasp push --force
node deploy-webapp.mjs
```

แล้วทำขั้นตอน Deploy Web app ใน Editor ตาม `gas/DEPLOY.md`

### 4. ตั้งค่าในเว็บคลังยา

1. เปิด https://pongvitsam.github.io/DrugInventorySystem/
2. ไป **ตั้งค่า / นำเข้า → ฐานข้อมูล Google**
3. วาง URL Web App → **บันทึก URL** → **ทดสอบการเชื่อมต่อ**
4. ถ้ามีข้อมูลรับ-เบิกใหม่ในเครื่อง: ระบบอัปโหลดอัตโนมัติเมื่อ Google ว่าง หรือเมื่อข้อมูลในเครื่องใหม่กว่า
5. เครื่องอื่นที่ข้อมูลเก่ากว่า: จะดึงจาก Google — **จะไม่ทับข้อมูลใหม่**

## API ที่ GAS ให้บริการ

| คำขอ | คำอธิบาย |
|------|----------|
| `GET ?action=ping` | ทดสอบการเชื่อมต่อ |
| `GET ?action=meta` | ดู revision ล่าสุด (เบา — ใช้ตรวจว่ามีข้อมูลใหม่จากเครื่องอื่น) |
| `GET ?action=export` | ดึงข้อมูลทั้งหมด (JSON) |
| `POST { action: 'import', data: {...} }` | บันทึกข้อมูลทั้งหมด (คืน revision ใหม่) |

## หลายอุปกรณ์

- ตั้ง URL เดียวกันทุกเครื่อง (เครื่องแรกอัปโหลดข้อมูล — เครื่องอื่นดึงข้อมูล)
- URL จะ sync ไปใน Settings (`gasWebAppUrl`) — เครื่องใหม่ที่ดึงข้อมูลแล้วจะได้ URL อัตโนมัติ
- เว็บดึงข้อมูลใหม่ทุก ~30 วินาที และเมื่อสลับกลับมาเปิดแท็บ
- ก่อนบันทึกรับเข้า/เบิก ระบบดึงข้อมูลล่าสุดก่อน และถ้าเครื่องนี้มีประวัติใหม่กว่าจะไม่ถูกทับ
- กด **ดึงข้อมูลล่าสุดจาก Google** ในแถบด้านข้างได้ตลอด

## ชีตใน Spreadsheet

- `Settings`, `Seq`, `Items`, `Stock`, `Receipts`, `ReceiptLines`
- `Transfers`, `TransferLines`, `Adjustments`, `AdjustmentLines`
- `Movements`, `MonthlyRequests`

## หมายเหตุ

- หลังบันทึกรับเข้า/เบิก/แก้รายการ ระบบจะ sync ขึ้น Google อัตโนมัติ (เมื่อตั้ง URL แล้ว)
- **Deploy GAS ใหม่** หลังอัปเดต `Code.gs` (เพิ่ม action `meta` และ revision)
- URL Web App เก็บในเบราว์เซอร์แต่ละเครื่อง — ต้องใส่ URL เดียวกันทุกเครื่อง
- อย่าแชร์ Spreadsheet ให้คนทั่วไปแก้ไขโดยตรง ควรใช้ผ่านเว็บเท่านั้น
- ถ้า deploy ใหม่ URL อาจเปลี่ยน — อัปเดตในเว็บทุกเครื่อง
