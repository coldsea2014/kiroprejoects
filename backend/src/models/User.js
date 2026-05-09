import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    service: { type: String, default: 'General' }, // ex: Etat civil, Urbanisme, RH...
    avatarUrl: { type: String, default: '' },
    online: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    fullName: this.fullName,
    email: this.email,
    service: this.service,
    avatarUrl: this.avatarUrl,
    online: this.online,
    lastSeen: this.lastSeen,
  };
};

export default mongoose.model('User', userSchema);
