import { NextResponse } from 'next/server';
import { getJob, getAllJobs, cancelJob } from '@/lib/batch_engine';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  // If no jobId, return all jobs
  if (!jobId) {
    const jobs = getAllJobs();
    return NextResponse.json(jobs.map(j => ({
      id: j.id,
      campaignId: j.campaignId,
      status: j.status,
      totalLeads: j.totalLeads,
      processedLeads: j.processedLeads,
      failedLeads: j.failedLeads,
      sentBatches: j.sentBatches,
      totalBatches: j.totalBatches,
      batchSize: j.batchSize,
      delayMs: j.delayMs,
      currentBatchIndex: j.currentBatchIndex,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      progress: j.totalLeads > 0 ? Math.round((j.processedLeads / j.totalLeads) * 100) : 0,
      errors: j.errors.slice(-5), // Last 5 errors only
    })));
  }

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ message: 'Job no encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    campaignId: job.campaignId,
    status: job.status,
    totalLeads: job.totalLeads,
    processedLeads: job.processedLeads,
    failedLeads: job.failedLeads,
    sentBatches: job.sentBatches,
    totalBatches: job.totalBatches,
    batchSize: job.batchSize,
    delayMs: job.delayMs,
    currentBatchIndex: job.currentBatchIndex,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    progress: job.totalLeads > 0 ? Math.round((job.processedLeads / job.totalLeads) * 100) : 0,
    errors: job.errors.slice(-10),
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ message: 'jobId es requerido' }, { status: 400 });
  }

  const cancelled = cancelJob(jobId);
  if (!cancelled) {
    return NextResponse.json({ message: 'Job no encontrado o no se puede cancelar' }, { status: 404 });
  }

  return NextResponse.json({ message: 'Job cancelado exitosamente' });
}
