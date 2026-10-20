import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import usersRoutes from './routes/usersRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import friendsRoutes from './routes/friendsRoutes.js';
import conversationsRoutes from './routes/conversationsRoutes.js';
import communitiesRoutes from './routes/communitiesRoutes.js';
import invitationsRoutes from './routes/invitationsRoutes.js';
import channelsRoutes from './routes/channelsRoutes.js';

export const app = express();

app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users/search', searchRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/communities', communitiesRoutes);
app.use('/api/invitations', invitationsRoutes);
app.use('/api/channels', channelsRoutes);

app.use(notFound);
app.use(errorHandler);
