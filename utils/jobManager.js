const EventEmitter = require('events');

class JobManager extends EventEmitter {
    constructor() {
        super();
        this.jobs = new Map();
    }

    createJob(jobId) {
        this.jobs.set(jobId, {
            status: 'Request received',
            progress: 10,
            updatedAt: Date.now()
        });
        this.emit(`update:${jobId}`, this.jobs.get(jobId));
    }

    updateJob(jobId, progress, status) {
        if (this.jobs.has(jobId)) {
            const job = {
                status,
                progress,
                updatedAt: Date.now()
            };
            this.jobs.set(jobId, job);
            this.emit(`update:${jobId}`, job);
        }
    }

    getJob(jobId) {
        return this.jobs.get(jobId);
    }

    deleteJob(jobId) {
        this.jobs.delete(jobId);
    }
}

module.exports = new JobManager();
