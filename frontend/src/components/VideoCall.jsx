import React, { useState, useEffect, useRef } from 'react';
import Peer from 'simple-peer';
import { socket } from '../socket';
import { Video, PhoneOff, Mic, MicOff, VideoOff } from 'lucide-react';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
  ]
};

const VideoCall = ({ username }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [remoteSocketId, setRemoteSocketId] = useState('');
  const [callerName, setCallerName] = useState('');
  const [callerSignal, setCallerSignal] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  const myVideo = useRef(null);
  const userVideo = useRef(null);
  const connectionRef = useRef(null);
  const localStreamRef = useRef(null);

  // ---- Socket listeners ----
  useEffect(() => {
    const onCallIncoming = (data) => {
      setReceivingCall(true);
      setRemoteSocketId(data.fromId);
      setCallerName(data.from);
      setCallerSignal(data.signal);
    };

    const onCallAccepted = (data) => {
      setCallAccepted(true);
      setIsCalling(false);
      setRemoteSocketId(data.fromId);
      if (connectionRef.current && !connectionRef.current.destroyed) {
        connectionRef.current.signal(data.signal);
      }
    };

    const onCallEnded = () => cleanupCall();
    const onCallRejected = (data) => { alert(data.reason || 'Call failed'); cleanupCall(); };

    const onInitiateCall = (e) => {
      const { userToCall, name, type } = e.detail;
      initiateCall(userToCall, name, type === 'video');
    };

    socket.on('call_incoming', onCallIncoming);
    socket.on('call_accepted', onCallAccepted);
    socket.on('call_ended', onCallEnded);
    socket.on('call_rejected', onCallRejected);
    window.addEventListener('initiate_call', onInitiateCall);

    return () => {
      socket.off('call_incoming', onCallIncoming);
      socket.off('call_accepted', onCallAccepted);
      socket.off('call_ended', onCallEnded);
      socket.off('call_rejected', onCallRejected);
      window.removeEventListener('initiate_call', onInitiateCall);
    };
  }, []);

  // ---- Attach LOCAL stream to video element ----
  useEffect(() => {
    if (localStream && myVideo.current) {
      myVideo.current.srcObject = localStream;
    }
  }, [localStream]);

  // ---- Attach REMOTE stream to video element ----
  useEffect(() => {
    if (remoteStream && userVideo.current) {
      userVideo.current.srcObject = remoteStream;
    }
  }, [remoteStream, callAccepted]);

  // ---- Get camera ----
  const getMediaStream = async (withVideo) => {
    const constraints = withVideo
      ? {
          video: { width: { ideal: 1920, min: 640 }, height: { ideal: 1080, min: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        }
      : { video: false, audio: { echoCancellation: true, noiseSuppression: true } };

    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(s);
      localStreamRef.current = s;
      setIsVideoEnabled(withVideo);
      return s;
    } catch (err) {
      console.warn('HD failed, trying basic...', err);
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: withVideo, audio: true });
        setLocalStream(s);
        localStreamRef.current = s;
        setIsVideoEnabled(withVideo);
        return s;
      } catch (err2) {
        alert('Camera/microphone access denied.');
        return null;
      }
    }
  };

  // ---- Caller: start call ----
  const initiateCall = async (targetUsername, name, withVideo) => {
    const mediaStream = await getMediaStream(withVideo);
    if (!mediaStream) return;

    setIsCalling(true);
    setCallerName(name);

    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: mediaStream,
      config: ICE_CONFIG,
      sdpTransform: (sdp) => {
        sdp = sdp.replace(/b=AS:\d+/g, 'b=AS:4000');
        if (!sdp.includes('b=AS:')) {
          sdp = sdp.replace(/m=video (.*)\r\n/, 'm=video $1\r\nb=AS:4000\r\n');
        }
        return sdp;
      }
    });

    peer.on('signal', (signalData) => {
      socket.emit('call_user', {
        userToCall: targetUsername,
        signalData,
        from: username,
      });
    });

    peer.on('stream', (stream) => {
      console.log('Caller received remote stream');
      setRemoteStream(stream);
    });

    peer.on('error', (err) => console.error('Peer error:', err));
    connectionRef.current = peer;
  };

  // ---- Receiver: answer call ----
  const answerCall = async () => {
    setCallAccepted(true);
    setReceivingCall(false);

    const mediaStream = await getMediaStream(true);
    if (!mediaStream) return;

    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: mediaStream,
      config: ICE_CONFIG,
      sdpTransform: (sdp) => {
        sdp = sdp.replace(/b=AS:\d+/g, 'b=AS:4000');
        if (!sdp.includes('b=AS:')) {
          sdp = sdp.replace(/m=video (.*)\r\n/, 'm=video $1\r\nb=AS:4000\r\n');
        }
        return sdp;
      }
    });

    peer.on('signal', (signalData) => {
      socket.emit('answer_call', { signal: signalData, to: remoteSocketId });
    });

    peer.on('stream', (stream) => {
      console.log('Receiver received remote stream');
      setRemoteStream(stream);
    });

    peer.on('error', (err) => console.error('Peer error:', err));

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  // ---- Cleanup ----
  const cleanupCall = () => {
    if (connectionRef.current) { connectionRef.current.destroy(); connectionRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
    setLocalStream(null);
    setRemoteStream(null);
    setCallAccepted(false);
    setReceivingCall(false);
    setIsCalling(false);
    setCallerName('');
    setCallerSignal(null);
    setRemoteSocketId('');
  };

  const leaveCall = () => {
    if (remoteSocketId) socket.emit('end_call', { to: remoteSocketId });
    cleanupCall();
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getVideoTracks()[0];
      if (t) { t.enabled = !t.enabled; setIsVideoEnabled(t.enabled); }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getAudioTracks()[0];
      if (t) { t.enabled = !t.enabled; setIsAudioEnabled(t.enabled); }
    }
  };

  if (!receivingCall && !callAccepted && !isCalling) return null;

  return (
    <>
      {receivingCall && !callAccepted && (
        <div className="incoming-call-modal animate-fade-in">
          <div className="incoming-header">
            <div className="user-avatar">{callerName.charAt(0).toUpperCase()}</div>
            <div>
              <div style={{ fontWeight: 'bold' }}>{callerName}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Incoming video call...</div>
            </div>
          </div>
          <div className="incoming-actions">
            <button className="btn btn-primary" onClick={answerCall}><Video size={18} /> Answer</button>
            <button className="btn btn-danger" onClick={leaveCall}><PhoneOff size={18} /> Decline</button>
          </div>
        </div>
      )}

      {(callAccepted || isCalling) && (
        <div className="video-overlay animate-fade-in">
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h2>{isCalling ? `Calling ${callerName}...` : `Call with ${callerName}`}</h2>
          </div>

          <div className="video-grid">
            <div className="video-container">
              {localStream ? (
                <video playsInline muted ref={myVideo} autoPlay />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>Loading camera...</div>
              )}
              <div className="video-label">You</div>
            </div>

            <div className="video-container">
              {remoteStream ? (
                <video playsInline ref={userVideo} autoPlay />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  {isCalling ? 'Waiting for answer...' : 'Connecting...'}
                </div>
              )}
              <div className="video-label">{callerName || 'Remote'}</div>
            </div>
          </div>

          <div className="call-controls">
            <button className="call-btn" style={{ background: isAudioEnabled ? 'rgba(255,255,255,0.2)' : 'var(--accent-danger)', color: 'white' }} onClick={toggleAudio}>
              {isAudioEnabled ? <Mic /> : <MicOff />}
            </button>
            <button className="call-btn" style={{ background: isVideoEnabled ? 'rgba(255,255,255,0.2)' : 'var(--accent-danger)', color: 'white' }} onClick={toggleVideo}>
              {isVideoEnabled ? <Video /> : <VideoOff />}
            </button>
            <button className="call-btn end" onClick={leaveCall}><PhoneOff /></button>
          </div>
        </div>
      )}
    </>
  );
};

export default VideoCall;
