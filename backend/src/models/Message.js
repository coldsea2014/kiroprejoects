import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Index compose pour recuperer rapidement une conversation entre 2 users
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
