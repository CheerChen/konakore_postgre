import time
import schedule


def run_periodic_scheduler():
    while True:
        schedule.run_pending()
        time.sleep(1)
