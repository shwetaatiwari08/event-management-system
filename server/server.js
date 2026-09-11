import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();
const app=express();
app.use(cors({origin:process.env.CLIENT_URL||"*"}));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI).then(()=>console.log("MongoDB connected")).catch(console.error);

const userSchema=new mongoose.Schema({
  name:{type:String,required:true}, email:{type:String,required:true,unique:true},
  password:{type:String,required:true}, role:{type:String,enum:["user","admin"],default:"user"}
},{timestamps:true});
const eventSchema=new mongoose.Schema({
  title:{type:String,required:true}, description:String, date:{type:Date,required:true},
  location:{type:String,required:true}, capacity:{type:Number,required:true,min:1},
  price:{type:Number,default:0}, image:String, createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"}
},{timestamps:true});
const bookingSchema=new mongoose.Schema({
  event:{type:mongoose.Schema.Types.ObjectId,ref:"Event",required:true},
  user:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  status:{type:String,enum:["confirmed","cancelled"],default:"confirmed"},
  bookedAt:{type:Date,default:Date.now}
});
bookingSchema.index({event:1,user:1},{unique:true});
const User=mongoose.model("User",userSchema);
const Event=mongoose.model("Event",eventSchema);
const Booking=mongoose.model("Booking",bookingSchema);

const sign=(u)=>jwt.sign({id:u._id,role:u.role},process.env.JWT_SECRET,{expiresIn:"7d"});
const auth=async(req,res,next)=>{
  try{
    const token=(req.headers.authorization||"").replace("Bearer ","");
    if(!token) return res.status(401).json({message:"Login required"});
    req.user=jwt.verify(token,process.env.JWT_SECRET); next();
  }catch(e){res.status(401).json({message:"Invalid or expired token"});}
};
const admin=(req,res,next)=>req.user.role==="admin"?next():res.status(403).json({message:"Admin only"});

app.get("/api/health",(req,res)=>res.json({ok:true}));

app.post("/api/auth/register",async(req,res)=>{
  try{
    const {name,email,password}=req.body;
    if(!name||!email||!password) return res.status(400).json({message:"All fields are required"});
    if(await User.findOne({email})) return res.status(400).json({message:"Email already registered"});
    const user=await User.create({name,email,password:await bcrypt.hash(password,10)});
    res.status(201).json({token:sign(user),user:{id:user._id,name:user.name,email:user.email,role:user.role}});
  }catch(e){res.status(500).json({message:e.message});}
});
app.post("/api/auth/login",async(req,res)=>{
  try{
    const user=await User.findOne({email:req.body.email});
    if(!user||!(await bcrypt.compare(req.body.password,user.password))) return res.status(401).json({message:"Invalid credentials"});
    res.json({token:sign(user),user:{id:user._id,name:user.name,email:user.email,role:user.role}});
  }catch(e){res.status(500).json({message:e.message});}
});

app.get("/api/events",async(req,res)=>res.json(await Event.find().sort({date:1})));
app.get("/api/events/:id",async(req,res)=>{
  const e=await Event.findById(req.params.id); if(!e)return res.status(404).json({message:"Event not found"});
  const booked=await Booking.countDocuments({event:e._id,status:"confirmed"});
  res.json({...e.toObject(),booked,seatsLeft:Math.max(0,e.capacity-booked)});
});
app.post("/api/events",auth,admin,async(req,res)=>{
  try{res.status(201).json(await Event.create({...req.body,createdBy:req.user.id}));}
  catch(e){res.status(400).json({message:e.message});}
});
app.put("/api/events/:id",auth,admin,async(req,res)=>{
  try{res.json(await Event.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true}));}
  catch(e){res.status(400).json({message:e.message});}
});
app.delete("/api/events/:id",auth,admin,async(req,res)=>{
  await Event.findByIdAndDelete(req.params.id); await Booking.deleteMany({event:req.params.id});
  res.json({message:"Event deleted"});
});

app.post("/api/bookings",auth,async(req,res)=>{
  try{
    const e=await Event.findById(req.body.eventId);
    if(!e)return res.status(404).json({message:"Event not found"});
    const count=await Booking.countDocuments({event:e._id,status:"confirmed"});
    if(count>=e.capacity)return res.status(400).json({message:"No seats available"});
    const b=await Booking.create({event:e._id,user:req.user.id});
    res.status(201).json(await b.populate("event"));
  }catch(e){res.status(400).json({message:e.code===11000?"Already booked":e.message});}
});
app.get("/api/bookings/my",auth,async(req,res)=>res.json(await Booking.find({user:req.user.id}).populate("event").sort({bookedAt:-1})));
app.patch("/api/bookings/:id/cancel",auth,async(req,res)=>{
  const b=await Booking.findOne({_id:req.params.id,user:req.user.id});
  if(!b)return res.status(404).json({message:"Booking not found"});
  b.status="cancelled"; await b.save(); res.json(b);
});
app.get("/api/admin/bookings",auth,admin,async(req,res)=>res.json(await Booking.find().populate("event user").sort({bookedAt:-1})));

app.listen(process.env.PORT||5000,()=>console.log("Server running on port",process.env.PORT||5000));
